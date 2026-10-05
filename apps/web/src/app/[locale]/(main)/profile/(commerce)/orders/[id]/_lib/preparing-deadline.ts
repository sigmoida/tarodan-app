/** @format */

import { isPreShipmentCancellableStatus } from "@tarodan/types";
import { hasShipped, isMembershipOrder, type OrderDetail } from "./types";

/**
 * Sipariş dosyasındaki "kargoya verme son tarihi" notu.
 *
 * Tarih sunucudan gelir (`preparingDeadline`): tek seferlik uzatmada sunucu
 * yeni son tarihi aynı alana yazar, ekran hesap yapmaz. `extended`, uzatmanın
 * kullanıldığını söyler — satıcıya "son süre", alıcıya "gecikme + iptal hakkı"
 * metni gösterilir. Not yalnız parası alınmış ama henüz yola çıkmamış
 * siparişte görünür; kargoya devredilmiş koli için son tarih artık anlamsızdır.
 */
export interface PreparingDeadlineNotice {
  deadline: string;
  extended: boolean;
  audience: "buyer" | "seller";
}

export function preparingDeadlineNoticeOf(
  order: OrderDetail,
): PreparingDeadlineNotice | null {
  if (!order.preparingDeadline) return null;
  if (!order.isBuyer && !order.isSeller) return null;
  if (isMembershipOrder(order)) return null;
  if (!isPreShipmentCancellableStatus(order.status) || hasShipped(order)) {
    return null;
  }
  return {
    deadline: order.preparingDeadline,
    extended: Boolean(order.preparingExtendedAt),
    audience: order.isSeller ? "seller" : "buyer",
  };
}
