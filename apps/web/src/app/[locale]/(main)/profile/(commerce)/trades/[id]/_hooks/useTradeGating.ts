/** @format */

"use client";

import type { useAuthStore } from "@/stores/authStore";
import { getTradeStatusMeta } from "../_lib/types";
import type { Trade } from "../_lib/types";

type TradeUser = ReturnType<typeof useAuthStore.getState>["user"];

/**
 * Pure derived flags of the two-party escrow state machine: perspective
 * (initiator/receiver), the accept/reject/counter/cancel gates (including the
 * warehouse cancel-lock nuance), the cash-payment state, whether the current
 * user still needs to ship, and the status metadata for the current locale.
 */
export function useTradeGating(
  trade: Trade | null,
  user: TradeUser,
  locale: string,
) {
  const TRADE_STATUS_META = getTradeStatusMeta(locale);

  const cashPaymentPending =
    trade?.cashAmount &&
    trade.cashAmount > 0 &&
    trade?.cashPayment?.status !== "completed";
  const isCashPayer = !!(trade && user && trade.cashPayerId === user.id);

  const needToShip =
    trade &&
    user &&
    !cashPaymentPending &&
    ((user.id === trade.initiatorId &&
      !trade.initiatorShipment &&
      (trade.status === "accepted" || trade.status === "receiver_shipped")) ||
      (user.id === trade.receiverId &&
        !trade.receiverShipment &&
        (trade.status === "accepted" || trade.status === "initiator_shipped")));

  const statusMeta = trade
    ? TRADE_STATUS_META[trade.status] || TRADE_STATUS_META.pending
    : TRADE_STATUS_META.pending;
  const isInitiator = !!trade && user?.id === trade.initiatorId;
  const isReceiver = !!trade && user?.id === trade.receiverId;
  const canAccept = isReceiver && trade?.status === "pending";
  const canReject = isReceiver && trade?.status === "pending";
  const canCounter =
    !!trade &&
    isReceiver &&
    trade.status === "pending" &&
    (!trade.responseDeadline || new Date(trade.responseDeadline) > new Date());
  // Cancel is allowed only in early statuses; locked once items enter the warehouse flow
  const cancellableStatuses = new Set([
    "pending",
    "accepted",
    "awaiting_payment",
    "shipping_to_warehouse",
  ]);
  // Warehouse arrival → user cancel kilidi (1 kargo bile depoya ulaşırsa)
  const cancelLockedByWarehouse =
    trade?.status === "shipping_to_warehouse" &&
    !!trade?.firstWarehouseArrivalAt;
  // Backend `canCancel` field'ı (mapToResponseDto.computeTradeCanCancel) varsa
  // onu kullan; yoksa local fallback.
  const canCancel =
    !!user &&
    !!trade &&
    (isInitiator || isReceiver) &&
    (typeof trade.canCancel === "boolean"
      ? trade.canCancel
      : cancellableStatuses.has(trade.status) && !cancelLockedByWarehouse);
  // Buton görünür ama disabled — kullanıcı "neden iptal edemiyorum" diye
  // bilmek için. Eligible bir state'teyiz ama warehouse arrival kilitlemiş.
  const showCancelDisabled =
    !!user &&
    !!trade &&
    (isInitiator || isReceiver) &&
    cancellableStatuses.has(trade.status) &&
    !canCancel;

  return {
    isInitiator,
    isReceiver,
    canAccept,
    canReject,
    canCounter,
    canCancel,
    showCancelDisabled,
    cashPaymentPending,
    isCashPayer,
    needToShip,
    statusMeta,
  };
}
