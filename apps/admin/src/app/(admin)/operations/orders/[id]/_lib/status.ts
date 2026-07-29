import type { useTranslations } from "next-intl";
import type { OrderDetail } from "../types";

type T = ReturnType<typeof useTranslations<never>>;

const statusMeta: Record<string, { key: string; color: string; bg: string }> = {
  pending_payment: {
    key: "admin.operations.orders.status.pendingPayment",
    color: "text-warning-600",
    bg: "bg-warning-100",
  },
  paid: {
    key: "admin.operations.orders.status.paid",
    color: "text-info-600",
    bg: "bg-info-100",
  },
  preparing: {
    key: "admin.operations.orders.status.preparing",
    color: "text-primary-600",
    bg: "bg-primary-100",
  },
  shipped: {
    key: "admin.operations.orders.status.shipped",
    color: "text-info-600",
    bg: "bg-info-100",
  },
  delivered: {
    key: "admin.operations.orders.status.delivered",
    color: "text-success-600",
    bg: "bg-success-100",
  },
  awaiting_buyer_confirmation: {
    key: "admin.operations.orders.status.awaitingBuyerConfirmation",
    color: "text-warning-600",
    bg: "bg-warning-100",
  },
  refund_requested: {
    key: "admin.operations.orders.status.refundRequested",
    color: "text-danger-600",
    bg: "bg-danger-100",
  },
  completed: {
    key: "admin.operations.orders.status.completed",
    color: "text-success-600",
    bg: "bg-success-100",
  },
  cancelled: {
    key: "admin.operations.orders.status.cancelled",
    color: "text-danger-600",
    bg: "bg-danger-100",
  },
  refunded: {
    key: "admin.operations.orders.status.refunded",
    color: "text-muted",
    bg: "bg-surface-alt",
  },
};

export interface OrderStatusView {
  label: string;
  color: string;
  bg: string;
  hasActiveRefund: boolean;
  isCancelledOrder: boolean;
}

/**
 * The order's headline status — priority: active refund > cancellation > raw
 * status. Mirrors the list badge logic.
 */
export function getOrderStatusInfo(order: OrderDetail, t: T): OrderStatusView {
  const hasActiveRefund =
    !!order.activeRefundRequest || order.status === "refund_requested";
  const isCancelledOrder =
    order.cancellationType === "iptal" || order.status === "cancelled";
  const info = hasActiveRefund
    ? {
        label: t("admin.operations.orders.status.refundInProgress"),
        color: "text-danger-600",
        bg: "bg-danger-100",
      }
    : order.cancellationType === "iptal"
      ? {
          label: t("admin.operations.orders.status.cancelledConfirmed"),
          color: "text-danger-600",
          bg: "bg-danger-100",
        }
      : (() => {
          const meta = statusMeta[order.status] || statusMeta.pending_payment;
          return {
            label: t(meta.key as Parameters<T>[0]),
            color: meta.color,
            bg: meta.bg,
          };
        })();
  return { ...info, hasActiveRefund, isCancelledOrder };
}

const POST_SHIPPING = [
  "shipped",
  "delivered",
  "awaiting_buyer_confirmation",
  "completed",
  "refund_requested",
  "refunded",
];

/** Post-shipping: cancellation disabled, refund flow applies. */
export function isPostShipping(status: string): boolean {
  return POST_SHIPPING.includes(status);
}

const ADMIN_MANUAL_STATUS_TARGETS: Record<string, readonly string[]> = {
  paid: ["preparing"],
  shipped: ["delivered"],
};

export function getAdminManualStatusTargets(status: string): readonly string[] {
  return ADMIN_MANUAL_STATUS_TARGETS[status] ?? [];
}

export function canManuallyUpdateOrderStatus(status: string): boolean {
  return getAdminManualStatusTargets(status).length > 0;
}

const SHIPPED_STATUSES = [
  "shipped",
  "delivered",
  "awaiting_buyer_confirmation",
  "completed",
];

/** Whether a real shipment exists: trackingNumber set + shipped stage + not cancelled. */
export function hasRealShipment(
  order: OrderDetail,
  isCancelledOrder: boolean,
): boolean {
  return (
    !!order.shipment &&
    !!order.shipment.trackingNumber &&
    SHIPPED_STATUSES.includes(order.status) &&
    !isCancelledOrder
  );
}
