import type { useTranslations } from "next-intl";
import { orderStatusConfig, type BadgeVariant } from "@tarodan/ui";

type T = ReturnType<typeof useTranslations<never>>;

/** Başlık rozetinin ihtiyacı olan asgari alanlar (grup dosyası satırları dahil). */
export interface OrderStatusSource {
  status: string;
  cancellationType?: string | null;
  activeRefundRequest?: unknown;
}

/**
 * Başlık rozetinin ÖZEL etiketleri (iade penceresi gibi ifadeler taşır) — renk
 * burada tutulmaz: varyant listedeki rozetle aynı tek kaynaktan, paylaşılan
 * `orderStatusConfig`'ten gelir.
 */
const statusLabelKey: Record<string, string> = {
  pending_payment: "admin.operations.orders.status.pendingPayment",
  paid: "admin.operations.orders.status.paid",
  preparing: "admin.operations.orders.status.preparing",
  shipped: "admin.operations.orders.status.shipped",
  delivered: "admin.operations.orders.status.delivered",
  awaiting_buyer_confirmation:
    "admin.operations.orders.status.awaitingBuyerConfirmation",
  refund_requested: "admin.operations.orders.status.refundRequested",
  completed: "admin.operations.orders.status.completed",
  cancelled: "admin.operations.orders.status.cancelled",
  refunded: "admin.operations.orders.status.refunded",
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
          const status =
            order.status in statusLabelKey ? order.status : "pending_payment";
          return {
            label: t(statusLabelKey[status] as Parameters<T>[0], {
              returnWindowDays,
            }),
            variant: orderStatusConfig[status].variant as BadgeVariant,
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
