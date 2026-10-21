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
  const [selectedCounterProducts, setSelectedCounterProducts] = useState<
    string[]
  >([]);
  const [selectedCounterTargetProducts, setSelectedCounterTargetProducts] =
    useState<string[]>([]);
  const [counterCashAmount, setCounterCashAmount] = useState<string>("");
  const [counterCashPayer, setCounterCashPayer] = useState<"me" | "them">("me");
  const [counterMessage, setCounterMessage] = useState("");

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
    resource: queryKeys.counterOffer.myResource,
    params: { userId },
    // Counter validation accepts any own active item, so no `tradeEligible`.
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
    params: { sellerId: trade?.initiatorId },
    fetchPage: async (page) => {
      const res = await listingsApi.getAll({
        sellerId: trade?.initiatorId,
        status: "active",
        tradeOnly: true,
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

  // Spinner only until each query's first result of this open settles; later
  // background refetches keep the lists on screen.
  const isPending = (q: typeof myQuery) =>
    q.isLoading || (q.isFetching && !q.isFetchedAfterMount);
  const isLoadingCounterData =
    queriesEnabled && (isPending(myQuery) || isPending(theirQuery));

  // A failed first load closes the editor with an error, as before.
  // (`isError` stays set while a reopen refetches, so wait for it to settle.)
  const failed = (q: typeof myQuery) => q.isError && !q.isFetching;
  const loadFailed = queriesEnabled && (failed(myQuery) || failed(theirQuery));
  useEffect(() => {
    if (!loadFailed) return;
    toast.error(t("collection.productsLoadFailed"));
    setIsCounterMode(false);
  }, [loadFailed, t]);

  // A pick that left a refreshed list (sold, deactivated, offered elsewhere)
  // drops out of the selection instead of being sent and rejected by the API.
  useEffect(() => {
    if (!queriesEnabled || isLoadingCounterData) return;
    const prune = (prev: string[], list: CounterProduct[]) => {
      const next = prev.filter((id) => list.some((p) => p.id === id));
      return next.length === prev.length ? prev : next;
    };
    setSelectedCounterProducts((prev) => prune(prev, counterProducts));
    setSelectedCounterTargetProducts((prev) =>
      prune(prev, counterTargetProducts),
    );
  }, [
    queriesEnabled,
    isLoadingCounterData,
    counterProducts,
    counterTargetProducts,
  ]);

  // Open the editor: pre-fill the selections and cash terms from the current
  // trade (swapped); the product lists load through the queries above.
  const handleOpenCounterModal = () => {
    if (!trade) return;
    setIsCounterMode(true);

    // What the receiver is offered (initiatorItems) is what they want in the counter.
    setSelectedCounterTargetProducts(
      trade.initiatorItems.map((item: TradeItem) => item.productId),
    );
    // What the receiver currently offers (receiverItems) stays offered.
    setSelectedCounterProducts(
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
    setSelectedCounterProducts([]);
    setSelectedCounterTargetProducts([]);
    setCounterCashAmount("");
    setCounterCashPayer("me");
    setCounterMessage("");
  };

  const toggleCounterProduct = (productId: string) => {
    setSelectedCounterProducts((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const toggleCounterTargetProduct = (productId: string) => {
    setSelectedCounterTargetProducts((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const handleCounterSubmit = () => {
    if (!trade) return;

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
    const newCashAmount = Math.abs(parseFloat(counterCashAmount) || 0);
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

    // Calculate cash amount: positive = initiator (receiver in counter) pays, negative = receiver (original initiator) pays
    let finalCashAmount: number | undefined = undefined;
    if (counterCashAmount && parseFloat(counterCashAmount) > 0) {
      finalCashAmount =
        counterCashPayer === "me"
          ? parseFloat(counterCashAmount)
          : -parseFloat(counterCashAmount);
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
      cashAmount: finalCashAmount,
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
    counterProducts,
    counterTargetProducts,
    counterProductsHasMore: !!myQuery.hasNextPage,
    counterProductsLoadingMore: myQuery.isFetchingNextPage,
    loadMoreCounterProducts: () => void myQuery.fetchNextPage(),
    counterTargetHasMore: !!theirQuery.hasNextPage,
    counterTargetLoadingMore: theirQuery.isFetchingNextPage,
    loadMoreCounterTarget: () => void theirQuery.fetchNextPage(),
    selectedCounterProducts,
    selectedCounterTargetProducts,
    counterCashAmount,
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
