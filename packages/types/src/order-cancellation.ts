import type { OrderStatusValue, ShipmentStatusValue } from "./commerce-status";

/**
 * "KARGOYA VERİLDİ" TANIMI ve kargo öncesi iptal uygunluğu — TEK KAYNAK.
 *
 * İptal hakkının bittiği an budur: koli taşıyıcıya fiziksel olarak geçtiyse
 * sipariş artık iptal edilemez, yalnız iade süreci işler. API (alıcı iptali,
 * admin iptali, escrow'un "satıcı göndermedi" taraması) ve admin paneli
 * (iptal aksiyonunun görünürlüğü) aynı kuralı buradan okur; ikisi ayrışırsa
 * panel, sunucunun reddedeceği bir düğme gösterir.
 *
 * İki sinyal birlikte değerlendirilir:
 *   1) HAREKET EDEN durumlar — poller gerçek kargo hareketiyle set eder.
 *   2) `shippedAt` — ilk fiziksel devir mührü. Sürat bilinmeyen bir durum kodu
 *      döndürdüğünde poller statüyü DEĞİŞTİRMEZ ama shippedAt'i yazar
 *      (order-tracking-sync). Yalnız statüye bakan bir kontrol bu durumda koli
 *      fiilen yoldayken iptali kabul ederdi.
 *
 * `pending` / `label_created` HARİÇTİR: barkod/etiket üretilmiş olabilir ama
 * paket henüz taşıyıcıya geçmemiştir (immediate-barcode her ödemede etiket
 * üretir). `cancelled` / `failed` de devir sayılmaz.
 */
export const SHIPMENT_IN_MOTION_STATUSES = [
  "picked_up",
  "in_transit",
  "at_delivery_branch",
  "out_for_delivery",
  "delivered",
  "return_in_progress",
  "returned",
] as const satisfies readonly ShipmentStatusValue[];

/** İptal kapılarının okuduğu asgari kargo şekli (API: Date, panel: ISO metin). */
export type HandoverShipmentShape = {
  status: string;
  shippedAt?: Date | string | null;
} | null;

/** Bu kargo satırı taşıyıcıya devredilmiş mi? (kayıt yoksa hayır) */
export function isShipmentHandedToCarrier(
  shipment: HandoverShipmentShape | undefined,
): boolean {
  if (!shipment) return false;
  return (
    (SHIPMENT_IN_MOTION_STATUSES as readonly string[]).includes(
      shipment.status,
    ) || shipment.shippedAt != null
  );
}

/**
 * Parası alınmış ama henüz yola çıkmamış sipariş statüleri — kargo öncesi
 * iptalin (alıcı ya da platform) açık olduğu tek aralık.
 */
export const PRE_SHIPMENT_CANCELLABLE_ORDER_STATUSES = [
  "paid",
  "preparing",
] as const satisfies readonly OrderStatusValue[];

export function isPreShipmentCancellableStatus(status: string): boolean {
  return (
    PRE_SHIPMENT_CANCELLABLE_ORDER_STATUSES as readonly string[]
  ).includes(status);
}

/**
 * Bir siparişin kargo öncesi iptalini engelleyen sebep; engel yoksa `null`.
 *
 * - `not_paid`: ödeme bekleyen sipariş — iade edilecek para yoktur.
 * - `closed`: zaten iptal/iade edilmiş.
 * - `active_refund`: sipariş iade sürecinde (`refund_requested`).
 * - `pending_cancellation`: kargo öncesi siparişte açık talep var. Kargo
 *   öncesi açılan her talep bir İPTALdir; açık kalmışsa (PSP hatası vb.)
 *   para yolu yarıda kalmıştır ve İade Talepleri'nde elle tamamlanmayı
 *   bekler — yeniden iptal etmek çözüm değildir.
 * - `handed_over`: koli taşıyıcıya geçmiş ya da sipariş kargo aşamasını
 *   geçmiş — iptal değil iade talebi akışı işler.
 */
export type PreShipmentCancelBlocker =
  | "not_paid"
  | "closed"
  | "active_refund"
  | "pending_cancellation"
  | "handed_over";

export interface PreShipmentCancelSubject {
  status: string;
  shipment: HandoverShipmentShape | undefined;
  /** Açık (terminal olmayan) iade talebi var mı? */
  hasActiveRefund?: boolean;
}

export function preShipmentCancelBlocker(
  order: PreShipmentCancelSubject,
): PreShipmentCancelBlocker | null {
  if (order.status === "pending_payment") return "not_paid";
  if (order.status === "cancelled" || order.status === "refunded") {
    return "closed";
  }
  if (order.status === "refund_requested") return "active_refund";
  if (!isPreShipmentCancellableStatus(order.status)) return "handed_over";
  if (isShipmentHandedToCarrier(order.shipment)) return "handed_over";
  if (order.hasActiveRefund) return "pending_cancellation";
  return null;
}

/**
 * `GET /admin/orders/:id/cancel-preview` — sipariş şimdi iptal edilse alıcıya
 * dönecek tutar (iptalin kendisiyle aynı hesap).
 */
export interface AdminOrderCancelPreview {
  refundAmount: number;
  /**
   * Gidiş kargosu iadeye dahil mi? Paketin son canlı kalemi iptal edilirken
   * dahildir; paketteki diğer kalemler hâlâ gönderilecekse koli yine yola
   * çıkacağından kargo iade edilmez.
   */
  shippingRefunded: boolean;
}

/** `POST /admin/orders/:id/cancel` yanıtı. */
export interface AdminOrderCancelResult {
  orderId: string;
  refundRequestId: string;
  refundNumber: string;
  refundAmount: number;
}

/** Kargo öncesi iptal (admin "Siparişi iptal et") bu sipariş için açık mı? */
export function isPreShipmentCancellable(
  order: PreShipmentCancelSubject,
): boolean {
  return preShipmentCancelBlocker(order) === null;
}
