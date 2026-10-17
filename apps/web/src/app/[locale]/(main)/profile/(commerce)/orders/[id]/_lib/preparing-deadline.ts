/** @format */

import {
  isPreShipmentCancellableStatus,
  isShipmentHandedToCarrier,
} from "@tarodan/types";
import { isMembershipOrder, type OrderDetail } from "./types";

/**
 * Sipariş dosyasındaki "kargoya verme son tarihi" notu.
 *
 * Tarih sunucudan gelir (`preparingDeadline`): tek seferlik uzatmada sunucu
 * yeni son tarihi aynı alana yazar, ekran hesap yapmaz. `extended`, uzatmanın
 * kullanıldığını söyler — satıcıya "son süre", alıcıya "gecikme + iptal hakkı"
 * metni gösterilir.
 *
 * Not, sunucunun gerçekten yapacağından fazlasını vaat etmez; bu yüzden
 * yalnız şu durumda görünür:
 *  - parası alınmış ama henüz yola çıkmamış sipariş, VE
 *  - koli taşıyıcıya devredilmemiş — sunucunun süre dolumu taramasıyla AYNI
 *    kural (`isShipmentHandedToCarrier`: hareket eden durum ya da `shippedAt`
 *    mührü). Devredilmiş koli için tarama iptal etmez; "otomatik iptal edilir"
 *    demek yanlış olurdu. VE
 *  - son tarih henüz geçmemiş. Geçmişse karar (uzatma ya da iptal) bir sonraki
 *    tarama turundadır; geçmiş bir tarihte iptal vaat edilmez.
 */
export interface PreparingDeadlineNotice {
  deadline: string;
  extended: boolean;
  audience: "buyer" | "seller";
}

export function preparingDeadlineNoticeOf(
  order: OrderDetail,
  now: Date = new Date(),
): PreparingDeadlineNotice | null {
  if (!order.preparingDeadline) return null;
  if (!order.isBuyer && !order.isSeller) return null;
  if (isMembershipOrder(order)) return null;
  if (!isPreShipmentCancellableStatus(order.status)) return null;
  if (isShipmentHandedToCarrier(order.shipment ?? null)) return null;
  const deadlineMs = new Date(order.preparingDeadline).getTime();
  if (Number.isNaN(deadlineMs) || deadlineMs <= now.getTime()) return null;
  return {
    deadline: order.preparingDeadline,
    extended: Boolean(order.preparingExtendedAt),
    audience: order.isSeller ? "seller" : "buyer",
  };
}
