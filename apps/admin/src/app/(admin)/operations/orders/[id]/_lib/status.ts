import type { useTranslations } from "next-intl";
import type { BadgeVariant } from "@tarodan/ui";

type T = ReturnType<typeof useTranslations<never>>;

/** Başlık rozetinin ihtiyacı olan asgari alanlar (grup dosyası satırları dahil). */
export interface OrderStatusSource {
  status: string;
  cancellationType?: string | null;
  activeRefundRequest?: unknown;
}

const statusMeta: Record<string, { key: string; variant: BadgeVariant }> = {
  pending_payment: {
    key: "admin.operations.orders.status.pendingPayment",
    variant: "warning",
  },
  paid: {
    key: "admin.operations.orders.status.paid",
    variant: "default",
  },
  preparing: {
    key: "admin.operations.orders.status.preparing",
    variant: "default",
  },
  shipped: {
    key: "admin.operations.orders.status.shipped",
    variant: "default",
  },
  delivered: {
    key: "admin.operations.orders.status.delivered",
    variant: "success",
  },
  awaiting_buyer_confirmation: {
    key: "admin.operations.orders.status.awaitingBuyerConfirmation",
    variant: "warning",
  },
  refund_requested: {
    key: "admin.operations.orders.status.refundRequested",
    variant: "danger",
  },
  completed: {
    key: "admin.operations.orders.status.completed",
    variant: "success",
  },
  cancelled: {
    key: "admin.operations.orders.status.cancelled",
    variant: "danger",
  },
  refunded: {
    key: "admin.operations.orders.status.refunded",
    variant: "outline",
  },
};

export interface OrderStatusView {
  label: string;
  variant: BadgeVariant;
  hasActiveRefund: boolean;
  isCancelledOrder: boolean;
}

/**
 * The order's headline status — priority: active refund > cancellation > raw
 * status. Mirrors the list badge logic. `returnWindowDays` is the Durations &
 * Rules policy value quoted by the "in return window" label.
 */
export function getOrderStatusInfo(
  order: OrderStatusSource,
  t: T,
  returnWindowDays: number,
): OrderStatusView {
  const hasActiveRefund =
    !!order.activeRefundRequest || order.status === "refund_requested";
  const isCancelledOrder =
    order.cancellationType === "iptal" || order.status === "cancelled";
  const info = hasActiveRefund
    ? {
        label: t("admin.operations.orders.status.refundInProgress"),
        variant: "danger" as const,
      }
    : order.cancellationType === "iptal"
      ? {
          label: t("admin.operations.orders.status.cancelledConfirmed"),
          variant: "danger" as const,
        }
      : (() => {
          const meta = statusMeta[order.status] || statusMeta.pending_payment;
          return {
            label: t(meta.key as Parameters<T>[0], { returnWindowDays }),
            variant: meta.variant,
          };
        })();
  return { ...info, hasActiveRefund, isCancelledOrder };
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
