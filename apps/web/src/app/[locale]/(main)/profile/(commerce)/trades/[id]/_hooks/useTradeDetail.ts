/** @format */

"use client";

import { useAuthStore } from "@/stores/authStore";
import { useLocale, useTranslations } from "next-intl";
import { useTradeQuery } from "./useTradeQuery";
import { useTradeQuote } from "./useTradeQuote";
import { useTradeShipments } from "./useTradeShipments";
import { useTradeCountdown } from "./useTradeCountdown";
import { useTradeGating } from "./useTradeGating";
import { useTradeActions } from "./useTradeActions";
import { useCounterOfferEditor } from "./useCounterOfferEditor";

/**
 * Thin composer for the trade-detail screen. Wires together the focused
 * sub-hooks — the trade query + invalidation, the escrow shipment slots, the
 * deadline countdown, the state-machine gating flags, all write actions, and
 * the counter-offer editor — and assembles the single view-model the page and
 * its sections consume. Each sub-hook owns its own toasts + invalidation.
 */
export function useTradeDetail() {
  const { user } = useAuthStore();
  const t = useTranslations();
  const locale = useLocale();

  const { trade, isLoading, invalidateTrade, tradeId } = useTradeQuery();

  // Ödeme satırları kabulde yazılır; öncesinde fiyat teklifi ekranı besler.
  const { quote, quoteLoading } = useTradeQuote(trade);

  const {
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
  } = useTradeShipments(trade, user);

  const countdown = useTradeCountdown(trade);

  const {
    isInitiator,
    isReceiver,
    canAccept,
    canReject,
    canCounter,
    canCancel,
    showCancelDisabled,
    cashPaymentPending,
    isCashPayer,
    paymentProgress,
    needToShip,
    statusMeta,
  } = useTradeGating(trade, user, locale);

  const {
    addresses,
    addressesLoading,
    shipAddressId,
    setShipAddressId,
    isActionLoading,
    cashPaymentLoading,
    tradeAddressId,
    setTradeAddressId,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    handleCashPayment,
    handleShipSubmit,
    handleConfirmReceipt,
    handleAccept,
    handleReject,
    handleCancel,
  } = useTradeActions({ trade, invalidateTrade, needToShip });

  const {
    costPreview,
    costPreviewLoading,
    costPreviewFailed,
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
    counterSubmitLoading,
    handleOpenCounterModal,
    handleExitCounterMode,
    toggleCounterProduct,
    toggleCounterTargetProduct,
    handleCounterSubmit,
  } = useCounterOfferEditor({ trade, invalidateTrade });

  return {
    trade,
    quote,
    quoteLoading,
    isLoading,
    tradeId,
    user,
    t,
    locale,
    countdown,
    statusMeta,
    // perspective / gating
    isInitiator,
    isReceiver,
    canAccept,
    canReject,
    canCounter,
    canCancel,
    showCancelDisabled,
    cashPaymentPending,
    isCashPayer,
    paymentProgress,
    needToShip,
    // shipments
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
    // addresses + ship form
    addresses,
    addressesLoading,
    shipAddressId,
    setShipAddressId,
    // action state
    isActionLoading: isActionLoading || counterSubmitLoading,
    cashPaymentLoading,
    tradeAddressId,
    setTradeAddressId,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    // handlers
    handleCashPayment,
    handleShipSubmit,
    handleConfirmReceipt,
    handleAccept,
    handleReject,
    handleCancel,
    handleOpenCounterModal,
    // counter mode
    costPreview,
    costPreviewLoading,
    costPreviewFailed,
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
    handleExitCounterMode,
    toggleCounterProduct,
    toggleCounterTargetProduct,
    handleCounterSubmit,
  };
}

export type TradeDetailVM = ReturnType<typeof useTradeDetail>;
