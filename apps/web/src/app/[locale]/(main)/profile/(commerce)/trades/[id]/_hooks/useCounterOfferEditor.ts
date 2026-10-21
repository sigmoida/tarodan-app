/** @format */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { tradesApi, listingsApi, userApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useWebInfiniteList } from "@/hooks/useWebResource";
import { flattenPages, toPagedResult } from "@/lib/pagedList";
import { queryKeys } from "@/lib/query/keys";
import {
  TRADE_PICKER_PAGE_SIZE,
  TRADE_PICKER_QUERY_OPTIONS,
} from "@/lib/query/tradePicker";
import type { Trade, TradeItem } from "../_lib/types";
import { mergeTradeItems, type CounterProduct } from "../_lib/counterProducts";
import { useTradeCostPreview } from "@/hooks/useTradeCostPreview";
import { usePagedPicks } from "@/hooks/usePagedPicks";
import {
  cashAmountValue,
  isCashRefused,
  signedCashAmount,
} from "@/lib/cashAmount";

interface UseCounterOfferEditorArgs {
  trade: Trade | null;
  invalidateTrade: () => Promise<unknown>;
}

/**
 * The counter-offer edit mode: opening the editor (fetching + pre-filling both
 * product lists and the cash terms from the current trade, swapped), the
 * product-selection toggles, the identical-offer guard, and the counter
 * mutation. Exposes `counterSubmitLoading` so the composer can fold it into the
 * screen-wide action-loading flag.
 */
export function useCounterOfferEditor({
  trade,
  invalidateTrade,
}: UseCounterOfferEditorArgs) {
  const t = useTranslations();
  const userId = useAuthStore((s) => s.user?.id);
  const [isCounterMode, setIsCounterMode] = useState(false);
  // When the editor was last opened: the lists count as loading until data
  // fetched after this moment arrives (the cache may hold an older open's).
  const [openedAt, setOpenedAt] = useState(0);
  const [counterCashAmount, setCounterCashAmount] = useState<string>("");
  const [counterCashPayer, setCounterCashPayer] = useState<"me" | "them">("me");
  const [counterMessage, setCounterMessage] = useState("");

  const counterCashValue = cashAmountValue(counterCashAmount);
  const counterCashRefused = isCashRefused(counterCashAmount);

  const counterMutation = useMutation({
    mutationFn: (data: {
      initiatorItems: Array<{ productId: string; quantity: number }>;
      receiverItems: Array<{ productId: string; quantity: number }>;
      cashAmount?: number;
      message?: string;
    }) => {
      if (!trade)
        throw new Error(t("page.trades.usecounteroffereditor.noTrade"));
      return tradesApi.counter(trade.id, data);
    },
    onSuccess: async () => {
      toast.success(t("trade.counterOfferSent"));
      setIsCounterMode(false);
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error(
          t("page.trades.usecounteroffereditor.failedToSendCounterOffer"),
          error,
        );
      const errorMessage =
        error.response?.data?.message || t("trade.counterOfferFailed");

      // Handle specific error for identical counter-offer
      if (
        errorMessage.includes(
          t("page.trades.usecounteroffereditor.oncekiTeklifIleAyni"),
        ) ||
        errorMessage.includes("identical")
      ) {
        toast.error(t("trade.counterOfferIdentical"));
      } else {
        toast.error(errorMessage);
      }
    },
  });

  // Both pickers page through the API ("Show more"); the server filters
  // (`tradeOnly`), so the only client work is merging in the items already in
  // the trade. Fresh on every open (`TRADE_PICKER_QUERY_OPTIONS`).
  const queriesEnabled = isCounterMode && !!trade;
  const myQuery = useWebInfiniteList<CounterProduct>({
    // The user's own tradeable listings live under the trade-eligible resource,
    // so every listing write that refreshes the new-trade picker
    // (`invalidateListingQueries`, the `invalidates` of the listing mutations)
    // refreshes this side too. The `picker` param keeps its own entry.
    resource: queryKeys.tradeEligible.resource,
    params: { userId, picker: "counter" },
    // Counter validation accepts any own active item, so no `tradeEligible`.
    // `tradeOnly` is the product choice (B-D1): only listings open to trade.
    fetchPage: async (page) => {
      const res = await userApi.getMyProducts({
        status: "active",
        tradeOnly: true,
        page,
        limit: TRADE_PICKER_PAGE_SIZE,
      });
      return toPagedResult<CounterProduct>(res.data, page);
    },
    enabled: queriesEnabled && !!userId,
    query: {
      ...TRADE_PICKER_QUERY_OPTIONS,
      meta: { page: "trades-counter-mine" },
    },
  });
  const theirQuery = useWebInfiniteList<CounterProduct>({
    resource: queryKeys.counterOffer.theirResource,
    // The public list depends on the viewer (blocked sellers are hidden), so the
    // key carries the user id like every other picker key.
    params: { userId, sellerId: trade?.initiatorId },
    fetchPage: async (page) => {
      const res = await listingsApi.getAll({
        sellerId: trade?.initiatorId,
        status: "active",
        tradeOnly: true,
        // The default (relevance) order moves with view counts between page
        // fetches, which can skip a listing at a page boundary; newest first is
        // stable (the same order as `GET /products/my`).
        sortBy: "created_desc",
        page,
        limit: TRADE_PICKER_PAGE_SIZE,
      });
      return toPagedResult<CounterProduct>(res.data, page);
    },
    enabled: queriesEnabled && !!trade?.initiatorId,
    query: {
      ...TRADE_PICKER_QUERY_OPTIONS,
      meta: { page: "trades-counter-theirs" },
    },
  });

  const counterProducts = useMemo(
    () =>
      mergeTradeItems(
        trade?.receiverItems ?? [],
        flattenPages(myQuery.data?.pages),
        // The want side of the original trade is never one of my own listings;
        // the guard keeps the old exclusion of the target.
        trade?.initiatorItems[0]?.productId,
      ),
    [trade, myQuery.data],
  );
  const counterTargetProducts = useMemo(
    () =>
      mergeTradeItems(
        trade?.initiatorItems ?? [],
        flattenPages(theirQuery.data?.pages),
      ),
    [trade, theirQuery.data],
  );

  // Spinner until each query's first result of this open settles (data newer
  // than the open, or a settled error); later background refetches keep the
  // lists on screen. The hooks stay mounted with the page, so
  // `isFetchedAfterMount` would only cover the first open.
  const isPending = (q: typeof myQuery) =>
    q.isLoading ||
    (q.dataUpdatedAt < openedAt && !(q.isError && !q.isFetching));
  const isLoadingCounterData =
    queriesEnabled && (isPending(myQuery) || isPending(theirQuery));

  // A failed first load (nothing to show) closes the editor with an error, as
  // before. A failed background refetch or "Show more" keeps the loaded lists
  // and the user's picks: `isError` is set then too, so require no data.
  // (`isError` stays set while a reopen refetches, so wait for it to settle.)
  const failed = (q: typeof myQuery) => q.isError && !q.isFetching && !q.data;
  const loadFailed = queriesEnabled && (failed(myQuery) || failed(theirQuery));
  useEffect(() => {
    if (!loadFailed) return;
    toast.error(t("collection.productsLoadFailed"));
    setIsCounterMode(false);
  }, [loadFailed, t]);

  // A pick that left a refreshed list (sold, deactivated, offered elsewhere)
  // drops out of the selection instead of being sent and rejected by the API;
  // one that only moved onto a page not loaded yet stays (`usePagedPicks`).
  const picksReady = queriesEnabled && !isLoadingCounterData;
  const myPicks = usePagedPicks({
    loaded: counterProducts,
    complete: !myQuery.hasNextPage,
    ready: picksReady,
  });
  const theirPicks = usePagedPicks({
    loaded: counterTargetProducts,
    complete: !theirQuery.hasNextPage,
    ready: picksReady,
  });
  const selectedCounterProducts = myPicks.pickedIds;
  const selectedCounterTargetProducts = theirPicks.pickedIds;

  // Open the editor: pre-fill the selections and cash terms from the current
  // trade (swapped); the product lists load through the queries above.
  const handleOpenCounterModal = () => {
    if (!trade) return;
    setIsCounterMode(true);
    setOpenedAt(Date.now());

    // The trade's own items are always in the lists (`mergeTradeItems`).
    // What the receiver is offered (initiatorItems) is what they want in the counter.
    theirPicks.select(
      trade.initiatorItems.map((item: TradeItem) => item.productId),
    );
    // What the receiver currently offers (receiverItems) stays offered.
    myPicks.select(
      trade.receiverItems.map((item: TradeItem) => item.productId),
    );

    if (trade.cashAmount && trade.cashAmount > 0) {
      setCounterCashAmount(trade.cashAmount.toString());
      // If the receiver was the cash payer they stay the payer by default.
      setCounterCashPayer(
        trade.cashPayerId === trade.receiverId ? "me" : "them",
      );
    } else {
      setCounterCashAmount("");
      setCounterCashPayer("me");
    }
    setCounterMessage("");
  };

  const handleExitCounterMode = () => {
    setIsCounterMode(false);
    myPicks.clear();
    theirPicks.clear();
    setCounterCashAmount("");
    setCounterCashPayer("me");
    setCounterMessage("");
  };

  const toggleCounterProduct = myPicks.toggle;
  const toggleCounterTargetProduct = theirPicks.toggle;

  const handleCounterSubmit = () => {
    if (!trade) return;

    if (counterCashRefused) {
      toast.error(t("trade.cashFormatRefused"));
      return;
    }

    if (selectedCounterProducts.length === 0) {
      toast.error(t("trade.selectAtLeastOneOffer"));
      return;
    }

    if (selectedCounterTargetProducts.length === 0) {
      toast.error(t("trade.selectAtLeastOneWant"));
      return;
    }

    // Check if counter-offer is identical to current trade
    const currentInitiatorItemIds = trade.initiatorItems
      .map((item) => item.productId)
      .sort();
    const currentReceiverItemIds = trade.receiverItems
      .map((item) => item.productId)
      .sort();
    const newInitiatorItemIds = [...selectedCounterProducts].sort();
    const newReceiverItemIds = [...selectedCounterTargetProducts].sort();
    const newCashAmount = counterCashValue;
    const currentCashAmount = Math.abs(trade.cashAmount || 0);

    const isIdentical =
      JSON.stringify(newInitiatorItemIds) ===
        JSON.stringify(currentReceiverItemIds) &&
      JSON.stringify(newReceiverItemIds) ===
        JSON.stringify(currentInitiatorItemIds) &&
      newCashAmount === currentCashAmount;

    if (isIdentical) {
      toast.error(t("trade.counterOfferIdentical"));
      return;
    }

    counterMutation.mutate({
      initiatorItems: selectedCounterProducts.map((id) => ({
        productId: id,
        quantity: 1,
      })),
      receiverItems: selectedCounterTargetProducts.map((id) => ({
        productId: id,
        quantity: 1,
      })),
      cashAmount: signedCashAmount(counterCashAmount, counterCashPayer),
      message: counterMessage || undefined,
    });
  };

  // The offer's cost depends on the selection (per-product fee + combined desi
  // shipping); the user must see it while building the offer, not after sending.
  const { preview, previewLoading, previewFailed } = useTradeCostPreview({
    myProductIds: selectedCounterProducts,
    theirProductIds: selectedCounterTargetProducts,
    cashAmount: counterCashAmount,
    cashPayer: counterCashPayer,
    enabled: isCounterMode,
  });

  return {
    costPreview: preview,
    costPreviewLoading: previewLoading,
    costPreviewFailed: previewFailed,
    isCounterMode,
    isLoadingCounterData,
    counterProducts: myPicks.rows,
    counterTargetProducts: theirPicks.rows,
    counterProductsHasMore: !!myQuery.hasNextPage,
    counterProductsLoadingMore: myQuery.isFetchingNextPage,
    loadMoreCounterProducts: () => void myQuery.fetchNextPage(),
    counterTargetHasMore: !!theirQuery.hasNextPage,
    counterTargetLoadingMore: theirQuery.isFetchingNextPage,
    loadMoreCounterTarget: () => void theirQuery.fetchNextPage(),
    selectedCounterProducts,
    selectedCounterTargetProducts,
    counterCashAmount,
    counterCashValue,
    counterCashRefused,
    setCounterCashAmount,
    counterCashPayer,
    setCounterCashPayer,
    counterMessage,
    setCounterMessage,
    counterSubmitLoading: counterMutation.isPending,
    handleOpenCounterModal,
    handleExitCounterMode,
    toggleCounterProduct,
    toggleCounterTargetProduct,
    handleCounterSubmit,
  };
}
