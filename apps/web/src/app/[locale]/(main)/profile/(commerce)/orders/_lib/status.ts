/** @format */

import { formatOrderStatus } from "@/lib/format";
import type { Order } from "./types";

import type { Translate } from "@/types/i18n";

/**
 * Liste durum rozeti kaynağı:
 *  1) Açık iade varsa → "İade Sürecinde" / "İade Edildi" (sipariş 'delivered' kalsa da).
 *  2) Kargo öncesi iptalde status 'refunded' olsa bile cancellationType='iptal' → "İptal Edildi".
 *  3) Aksi halde sipariş durumu (config + çeviri).
 * Dönen `status` @tarodan/ui `orderStatusConfig`'e beslenir (variant seçimi).
 */
export function getDisplayStatus(
  order: Order,
  t: Translate,
  locale: string,
): { status: string; label: string } {
  const localizedLabels: Record<string, string> = {
    pending_payment: t("order.statusPending"),
    paid: t("order.statusPaid"),
    preparing: t("order.statusProcessing"),
    shipped: t("order.statusShipped"),
    delivered: t("order.statusDelivered"),
    awaiting_buyer_confirmation: t("order.statusAwaitingConfirmation"),
    completed: t("order.statusCompleted"),
    cancelled: t("order.statusCancelled"),
    refund_requested: t("order.refundStarted"),
    refunded: t("order.statusRefunded"),
  };

  if (order.activeRefundRequest) {
    const done = order.activeRefundRequest.status === "refunded";
    return {
      status: done ? "refunded" : "refund_requested",
      label: done ? t("order.statusRefunded") : t("order.refundInProgress"),
    };
  }
  if (order.cancellationType === "iptal") {
    return { status: "cancelled", label: t("order.statusCancelled") };
  }
  return {
    status: order.status,
    label:
      localizedLabels[order.status] || formatOrderStatus(order.status, locale),
  };
}
