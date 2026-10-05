import type { AdminCancelRequest } from "./admin-cancellation";
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
 * - `not_paid`: ödeme bekleyen sipariş — iade edilecek para yoktur (admin
 *   iptalinde engel değil, `unpaid` türüdür: `adminOrderCancelEligibility`).
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

/** Kargo öncesi (ödenmiş) iptal bu sipariş için açık mı? */
export function isPreShipmentCancellable(
  order: PreShipmentCancelSubject,
): boolean {
  return preShipmentCancelBlocker(order) === null;
}

// ── Admin (platform) iptali ─────────────────────────────────────────────────

/**
 * Admin "Siparişi iptal et"in TÜRÜ — hangi mevcut çekirdeğin çalışacağını
 * söyler; yeni bir para yolu yoktur:
 * - `unpaid`: ödeme bekleyen sipariş. Para hareketi yok; stok ve kupon
 *   rezervasyonu serbest kalır (alıcı iptaliyle aynı çekirdek,
 *   `OrderLifecycleService.cancelUnpaidOrderInTx`).
 * - `paid_pre_handover`: ödenmiş, koli taşıyıcıya geçmemiş. Tam iade (alıcı
 *   iptaliyle aynı çekirdek, `RefundService.createPlatformCancellationRefund`).
 *
 * Teklif siparişi ayrı bir tür DEĞİLDİR: aynı statüler, aynı çekirdekler,
 * aynı uçlar — bağlı teklifin kapanması çekirdeklerin işidir.
 */
export const ADMIN_ORDER_CANCEL_KINDS = [
  "unpaid",
  "paid_pre_handover",
] as const;

export type AdminOrderCancelKind = (typeof ADMIN_ORDER_CANCEL_KINDS)[number];

/**
 * Admin iptalini engelleyen sebep. Kargo öncesi kuralın engelleridir
 * (`not_paid` hariç — admin için o bir türdür) ve devir sonrası durumlar
 * panelde net bir metin gösterilebilsin diye ayrıştırılır:
 * - `handed_over`: koli taşıyıcıda / yolda → iade talebi akışı.
 * - `delivered`: teslim edildi (alıcı onayı bekleniyor olabilir) → iade akışı.
 * - `completed`: sipariş tamamlandı, satıcı ödemesi yapıldı/yapılacak.
 * - `closed`, `active_refund`, `pending_cancellation`: bkz.
 *   `PreShipmentCancelBlocker` (açık talebin kendi onay/ret/kapat aksiyonları
 *   vardır; admin iptali onların yerine geçmez).
 */
export const ADMIN_ORDER_CANCEL_BLOCKERS = [
  "closed",
  "active_refund",
  "pending_cancellation",
  "handed_over",
  "delivered",
  "completed",
] as const;

export type AdminOrderCancelBlocker =
  (typeof ADMIN_ORDER_CANCEL_BLOCKERS)[number];

export type AdminOrderCancelEligibility =
  | { allowed: true; kind: AdminOrderCancelKind }
  | { allowed: false; blocker: AdminOrderCancelBlocker };

/** Teslim edilmiş ama tamamlanmamış sipariş statüleri. */
const DELIVERED_ORDER_STATUSES: readonly OrderStatusValue[] = [
  "delivered",
  "awaiting_buyer_confirmation",
];

/**
 * Admin iptali uygunluğu — TEK kural. API (önizleme, iptal ve kilit altındaki
 * yeniden değerlendirme) ve admin paneli (dosya düğmesi, satır menüsü, teklif
 * ekranı, engel metni) bunu okur. Kargo öncesi kuralın (`preShipmentCancelBlocker`)
 * üstüne kurulur; ikinci bir kural değildir.
 */
export function adminOrderCancelEligibility(
  order: PreShipmentCancelSubject,
): AdminOrderCancelEligibility {
  const blocker = preShipmentCancelBlocker(order);
  if (blocker === null) return { allowed: true, kind: "paid_pre_handover" };
  if (blocker === "not_paid") return { allowed: true, kind: "unpaid" };
  if (blocker !== "handed_over") return { allowed: false, blocker };
  if (order.status === "completed") {
    return { allowed: false, blocker: "completed" };
  }
  if ((DELIVERED_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    return { allowed: false, blocker: "delivered" };
  }
  return { allowed: false, blocker: "handed_over" };
}

/**
 * Sonucun engeli; izinliyse null. `in` ile daralır: `allowed` boolean
 * ayırıcısı `strictNullChecks` kapalı derlemelerde (admin) daralmaz.
 */
export function adminOrderCancelBlockerOf(
  eligibility: AdminOrderCancelEligibility,
): AdminOrderCancelBlocker | null {
  return "blocker" in eligibility ? eligibility.blocker : null;
}

/** Engelin paneldeki açıklaması (katalog anahtarı). */
export const ADMIN_ORDER_CANCEL_BLOCKER_I18N_KEYS = {
  closed: "admin.operations.orders.cancel.blockers.closed",
  active_refund: "admin.operations.orders.cancel.blockers.activeRefund",
  pending_cancellation:
    "admin.operations.orders.cancel.blockers.pendingCancellation",
  handed_over: "admin.operations.orders.cancel.blockers.handedOver",
  delivered: "admin.operations.orders.cancel.blockers.delivered",
  completed: "admin.operations.orders.cancel.blockers.completed",
} as const satisfies Record<AdminOrderCancelBlocker, string>;

/**
 * Ödenmemiş siparişin stok rezervasyonu (kural API'de: `orderReservationState`).
 * Teklif siparişi rezervi ilk ödeme başlatmada alır; o ana dek `not_reserved`.
 */
export type OrderReservationState =
  "held" | "already_released" | "not_reserved";

/**
 * `GET /admin/orders/:id/cancel-preview` — iptal şimdi yapılsa ne olur. Tutar
 * iptalin kendisiyle AYNI hesaptan gelir. `kind` onay isteğinde
 * `expectedKind` olarak geri gönderilir: önizleme ile onay arasında sipariş
 * ödendiyse sunucu "para yok"tan "iade"ye SESSİZCE geçmez.
 */
export type AdminOrderCancelPreview =
  | {
      kind: "unpaid";
      /** İptal edilen adet. */
      quantity: number;
      /**
       * Siparişin stok rezervasyonu: `held` → `quantity` adet serbest kalır;
       * `already_released` → süpürme zaten bıraktı; `not_reserved` → teklif
       * siparişinin ödemesi hiç başlatılmadı, ayrılmış stok yok.
       */
      reservation: OrderReservationState;
    }
  | {
      kind: "paid_pre_handover";
      /** İptal edilen adet — iade ile stoğa geri eklenir. */
      quantity: number;
      refundAmount: number;
      /**
       * Gidiş kargosu iadeye dahil mi? Paketin son canlı kalemi iptal
       * edilirken dahildir; paketteki diğer kalemler hâlâ gönderilecekse koli
       * yine yola çıkacağından kargo iade edilmez.
       */
      shippingRefunded: boolean;
    };

/** `POST /admin/orders/:id/cancel` gövdesi. */
export interface AdminOrderCancelRequest extends AdminCancelRequest {
  /** Önizlemenin türü — kilit altında değişmişse iptal 409 ile durur. */
  expectedKind: AdminOrderCancelKind;
}

/** `POST /admin/orders/:id/cancel` yanıtı. */
export type AdminOrderCancelResult =
  | { orderId: string; kind: "unpaid" }
  | {
      orderId: string;
      kind: "paid_pre_handover";
      refundRequestId: string;
      refundNumber: string;
      refundAmount: number;
    };
