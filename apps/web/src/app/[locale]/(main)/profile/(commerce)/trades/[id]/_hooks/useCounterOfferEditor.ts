/** @format */

"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { tradesApi, listingsApi, userApi } from "@/lib/api";
import type { Trade, TradeItem } from "../_lib/types";
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
  const [isCounterMode, setIsCounterMode] = useState(false);
  const [counterProducts, setCounterProducts] = useState<any[]>([]);
  const [counterTargetProducts, setCounterTargetProducts] = useState<any[]>([]);
  const [selectedCounterProducts, setSelectedCounterProducts] = useState<
    string[]
  >([]);
  const [selectedCounterTargetProducts, setSelectedCounterTargetProducts] =
    useState<string[]>([]);
  const [counterCashAmount, setCounterCashAmount] = useState<string>("");
  const [counterCashPayer, setCounterCashPayer] = useState<"me" | "them">("me");
  const [counterMessage, setCounterMessage] = useState("");
  const [isLoadingCounterData, setIsLoadingCounterData] = useState(false);

  const counterMutation = useMutation({
    mutationFn: (data: {
      initiatorItems: Array<{ productId: string; quantity: number }>;
      receiverItems: Array<{ productId: string; quantity: number }>;
      cashAmount?: number;
      message?: string;
    }) => {
      if (!trade) throw new Error("no trade");
      return tradesApi.counter(trade.id, data);
    },
    onSuccess: async () => {
      toast.success(t("trade.counterOfferSent"));
      setIsCounterMode(false);
      await invalidateTrade();
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to send counter offer:", error);
      const errorMessage =
        error.response?.data?.message || t("trade.counterOfferFailed");

      // Handle specific error for identical counter-offer
      if (
        errorMessage.includes("Önceki teklif ile aynı") ||
        errorMessage.includes("identical")
      ) {
        toast.error(t("trade.counterOfferIdentical"));
      } else {
        toast.error(errorMessage);
      }
    },
  });

  const handleOpenCounterModal = async () => {
    if (!trade) return;
    setIsCounterMode(true);
    setIsLoadingCounterData(true);

    try {
      // Fetch my products (for counter-offer initiator items)
      const myProductsRes = await userApi.getMyProducts();
      const myProducts =
        myProductsRes.data.data || myProductsRes.data.products || [];
      const tradeableProducts = myProducts.filter(
        (p: any) =>
          p.status === "active" &&
          p.isTradeEnabled &&
          p.id !== trade.initiatorItems[0]?.productId,
      );
      setCounterProducts(tradeableProducts);

      // Fetch original initiator's products (for counter-offer receiver items)
      const originalInitiatorId = trade.initiatorId;

      // Get products that are currently in the trade (these should be shown and pre-selected)
      const currentTradeProductIds = trade.initiatorItems.map(
        (item: TradeItem) => item.productId,
      );

      // Create product objects from trade items (they already have id, title, image)
      const currentTradeProducts = trade.initiatorItems.map(
        (item: TradeItem) => ({
          id: item.productId,
          title: item.productTitle,
          price: item.valueAtTrade, // Use value at trade time
          images: item.productImages?.length
            ? item.productImages
            : item.productImage
              ? [{ cardUrl: item.productImage, detailUrl: item.productImage }]
              : [],
          status: "reserved", // These are in a trade, so they're reserved
          isTradeEnabled: true, // They're already in a trade, so they must be trade-enabled
        }),
      );

      // Get active and trade-enabled products (excluding ones already in current trade to avoid duplicates)
      const activeListingsRes = await listingsApi.getAll({
        sellerId: originalInitiatorId,
        status: "active",
        tradeOnly: true,
        limit: 100,
      });
      const activeProducts =
        activeListingsRes.data.products || activeListingsRes.data.data || [];

      // Filter out products already in current trade
      const otherActiveProducts = activeProducts.filter(
        (p: any) => !currentTradeProductIds.includes(p.id),
      );

      // Combine: current trade products + other active trade-enabled products
      const allInitiatorProducts = [
        ...currentTradeProducts,
        ...otherActiveProducts,
      ];

      // All products should be trade-enabled (current trade products are already in a trade, so include them)
      const tradeableInitiatorProducts = allInitiatorProducts.filter(
        (p: any) => {
          const isInCurrentTrade = currentTradeProductIds.includes(p.id);
          return (
            isInCurrentTrade || (p.isTradeEnabled && p.status === "active")
          );
        },
      );

      setCounterTargetProducts(tradeableInitiatorProducts);

      // Pre-fill form with current trade data (swapped)
      // What receiver currently wants (initiatorItems) -> what receiver will want in counter (selectedCounterTargetProducts)
      setSelectedCounterTargetProducts(
        trade.initiatorItems.map((item: TradeItem) => item.productId),
      );

      // What receiver currently offers (receiverItems) -> what receiver will offer in counter (selectedCounterProducts)
      // Create product objects from receiver items for the list
      const currentReceiverProducts = trade.receiverItems.map(
        (item: TradeItem) => ({
          id: item.productId,
          title: item.productTitle,
          price: item.valueAtTrade,
          images: item.productImages?.length
            ? item.productImages
            : item.productImage
              ? [{ cardUrl: item.productImage, detailUrl: item.productImage }]
              : [],
          status: "reserved",
          isTradeEnabled: true,
        }),
      );

      // Combine current receiver products with other available products
      const allReceiverProducts = [
        ...currentReceiverProducts,
        ...tradeableProducts.filter(
          (p: { id: string }) =>
            !trade.receiverItems.some(
              (item: TradeItem) => item.productId === p.id,
            ),
        ),
      ];
      setCounterProducts(allReceiverProducts);

      // Pre-select current receiver products
      const currentReceiverProductIds = trade.receiverItems.map(
        (item: TradeItem) => item.productId,
      );
      setSelectedCounterProducts(currentReceiverProductIds);

      // Pre-fill cash amount
      if (trade.cashAmount && trade.cashAmount > 0) {
        setCounterCashAmount(trade.cashAmount.toString());
        // Determine cash payer: if current cashPayerId is receiver, then receiver was paying
        // In counter, if receiver was paying, they might want to change it
        setCounterCashPayer(
          trade.cashPayerId === trade.receiverId ? "me" : "them",
        );
      } else {
        setCounterCashAmount("");
        setCounterCashPayer("me");
      }

      setCounterMessage("");
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to load counter-offer data:", error);
      toast.error(t("collection.productsLoadFailed"));
      setIsCounterMode(false);
    } finally {
      setIsLoadingCounterData(false);
    }
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
    const newInitiatorItemIds = selectedCounterProducts.sort();
    const newReceiverItemIds = selectedCounterTargetProducts.sort();
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

  // Teklifin maliyeti seçime bağlıdır (ürün başına ücret + birleşik desi kargo);
  // kullanıcı bunu teklifi gönderdikten SONRA değil, kurarken görmeli.
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
