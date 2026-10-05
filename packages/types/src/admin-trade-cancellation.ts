import type { AdminCancelReasonCode } from "./admin-cancellation";
import { isShipmentHandedToCarrier } from "./order-cancellation";

/**
 * ADMIN (PLATFORM) TAKAS İPTALİ — uygunluk kuralı, TEK KAYNAK.
 *
 * API (önizleme + iptal, satır kilidi altında yeniden) ve admin paneli (düğme /
 * engel metni) aynı kuralı buradan okur; ikisi ayrışırsa panel, sunucunun
 * reddedeceği bir düğme gösterir.
 *
 * Kural, bir tarafın ya da süre dolumu taramasının ZATEN iptal edebildiği
 * aşamalarla sınırlıdır — yeni bir para ya da kargo yolu açılmaz:
 *   - `pending`, `accepted`: henüz para alınmadı.
 *   - `awaiting_payment`: taraflardan biri ödemiş olabilir; ödeyen tam iade alır.
 *   - `shipping_to_warehouse`: YALNIZ hiçbir tarafın kolisi taşıyıcıya
 *     geçmemişken. Etiket basılmış ama devredilmemiş koli iptale engel değildir;
 *     etiket mevcut iptallerin yolundan (Sürat iptal görevi) iptal edilir.
 *
 * Geri kalan her aşamanın kendi admin aksiyonu vardır (depo reddi,
 * force-cancel-stuck, itiraz çözümü, iade bacağı kapanışı) ve burada engel
 * olarak kalır.
 */
export const ADMIN_TRADE_CANCELLABLE_STATUSES = [
  "pending",
  "accepted",
  "awaiting_payment",
  "shipping_to_warehouse",
] as const;

export type AdminTradeCancellableStatus =
  (typeof ADMIN_TRADE_CANCELLABLE_STATUSES)[number];

/**
 * Platform iptalini engelleyen sebep.
 *
 * - `closed`: takas zaten bitti (tamamlandı / iptal / ret).
 * - `disputed`: itiraz açık — çözüm itiraz akışındadır.
 * - `parcel_handed_over`: depoya giden kolilerden biri taşıyıcıya geçti ya da
 *   depoya ulaştı — takılı takas çözümü / kayıp koli akışı işler.
 * - `at_warehouse`: ürünler depoda / kontrolde — depo reddi işler.
 * - `shipping_to_recipients`: ürünler yeni sahiplerine yolda — itiraz işler.
 * - `returning`: iade bacakları yolda — iade kapanışı işler.
 * - `legacy_shipped`: eski eşler-arası akışta ürün kargolandı.
 */
export const ADMIN_TRADE_CANCEL_BLOCKERS = [
  "closed",
  "disputed",
  "parcel_handed_over",
  "at_warehouse",
  "shipping_to_recipients",
  "returning",
  "legacy_shipped",
] as const;

export type AdminTradeCancelBlocker =
  (typeof ADMIN_TRADE_CANCEL_BLOCKERS)[number];

/**
 * Engelin metni — API hatası ve panel aynı anahtarı okur (aynı cümle iki ayrı
 * adla katalogda durmasın diye).
 */
export const ADMIN_TRADE_CANCEL_BLOCKER_I18N_KEYS = {
  closed: "server.admin.trade.cancelBlocked.closed",
  disputed: "server.admin.trade.cancelBlocked.disputed",
  parcel_handed_over: "server.admin.trade.cancelBlocked.parcelHandedOver",
  at_warehouse: "server.admin.trade.cancelBlocked.atWarehouse",
  shipping_to_recipients:
    "server.admin.trade.cancelBlocked.shippingToRecipients",
  returning: "server.admin.trade.cancelBlocked.returning",
  legacy_shipped: "server.admin.trade.cancelBlocked.legacyShipped",
} as const satisfies Record<AdminTradeCancelBlocker, string>;

/** Uygun aşamaların dışındaki statülerin engeli. */
const STATUS_BLOCKERS: Readonly<Record<string, AdminTradeCancelBlocker>> = {
  completed: "closed",
  cancelled: "closed",
  rejected: "closed",
  disputed: "disputed",
  at_warehouse: "at_warehouse",
  admin_reviewing: "at_warehouse",
  shipping_to_recipients: "shipping_to_recipients",
  returning: "returning",
  initiator_shipped: "legacy_shipped",
  receiver_shipped: "legacy_shipped",
  both_shipped: "legacy_shipped",
  initiator_received: "legacy_shipped",
  receiver_received: "legacy_shipped",
};

/** Kural için gereken asgari kargo şekli (API: Date, panel: ISO metin). */
export interface TradeHandoverShipment {
  /** `to_warehouse` | `from_warehouse` | `return`; yoksa `to_warehouse` (kolon varsayılanı). */
  leg?: string | null;
  status: string;
  shippedAt?: Date | string | null;
  deliveredAt?: Date | string | null;
}

export interface TradeHandoverSubject {
  /** İlk depo varışı — dolu ise bir koli fiziksel olarak depoda. */
  firstWarehouseArrivalAt?: Date | string | null;
  /** Kullanıcı iptal kilidi; ilk depo varışıyla birlikte damgalanır. */
  cancelLockedAt?: Date | string | null;
  shipments: readonly TradeHandoverShipment[];
}

/**
 * Depoya giden kolilerden biri taşıyıcıya geçti mi?
 *
 * Takas iptal kapılarının (kullanıcı iptali, süre dolumu taraması) eşiğiyle
 * AYNI tanım: bir `to_warehouse` bacağının `shippedAt` mührü ya da ilk depo
 * varışı (`firstWarehouseArrivalAt`). Bacak düzeyindeki "devredildi" kararı
 * siparişlerle ortak `isShipmentHandedToCarrier`'dan gelir (hareket eden
 * durum VEYA `shippedAt`); teslim damgası da devir sayılır (depoya ulaşan koli
 * elbette taşıyıcıdan geçmiştir). `pending` / `label_created` etiket
 * devredilmiş sayılmaz — o etiket iptalde iptal edilir.
 */
export function isTradeParcelHandedToCarrier(
  trade: TradeHandoverSubject,
): boolean {
  if (trade.firstWarehouseArrivalAt != null || trade.cancelLockedAt != null) {
    return true;
  }
  return trade.shipments.some(
    (shipment) =>
      (shipment.leg ?? "to_warehouse") === "to_warehouse" &&
      (isShipmentHandedToCarrier(shipment) || shipment.deliveredAt != null),
  );
}

export function isAdminTradeCancellableStatus(
  status: string,
): status is AdminTradeCancellableStatus {
  return (ADMIN_TRADE_CANCELLABLE_STATUSES as readonly string[]).includes(
    status,
  );
}

/**
 * Platform iptalinin engeli; engel yoksa `null`. Tanınmayan bir statü
 * kapalı sayılır (fail-closed) — yeni bir statü eklendiğinde ilk iş bu
 * tabloya yerini vermektir.
 */
export function adminTradeCancelBlocker(
  trade: { status: string } & TradeHandoverSubject,
): AdminTradeCancelBlocker | null {
  if (!isAdminTradeCancellableStatus(trade.status)) {
    return STATUS_BLOCKERS[trade.status] ?? "closed";
  }
  if (isTradeParcelHandedToCarrier(trade)) return "parcel_handed_over";
  return null;
}

/**
 * "Diğer" seçilince iç not zorunludur (taraflara yalnız kodun etiketi gider;
 * "Diğer" tek başına admin denetimi için yetersiz bir açıklamadır).
 */
export function isAdminCancelNoteRequired(
  reasonCode: AdminCancelReasonCode,
): boolean {
  return reasonCode === "other";
}

/** Bir tarafın platform iptalindeki para durumu. */
export interface AdminTradeCancelRefundLine {
  userId: string;
  side: "initiator" | "receiver";
  /** Bu tarafın ödemesi tahsil edildi mi? */
  paid: boolean;
  /**
   * Bu tarafa dönecek tutar. Platform iptali hiçbir tarafın kusuru değildir:
   * tahsil edilenin tamamı (hizmet bedeli ve kargo dahil) iade edilir.
   */
  refundAmount: number;
}

/** Rezervasyonu çözülecek ürün (kabulden önce rezervasyon yoktur). */
export interface AdminTradeCancelReleasedItem {
  productId: string;
  title: string;
  side: "initiator" | "receiver";
  quantity: number;
}

/**
 * `GET /admin/trades/:id/cancel-preview` — iptal şimdi yapılsa kime ne kadar
 * döner, ne serbest kalır. İptalle AYNI politika fonksiyonundan hesaplanır.
 */
export interface AdminTradeCancelPreview {
  tradeId: string;
  tradeNumber: string;
  status: AdminTradeCancellableStatus;
  /** Taraf başına bir satır (initiator, receiver). */
  refunds: AdminTradeCancelRefundLine[];
  refundTotal: number;
  /** Rezervasyonu çözülecek ürünler; `pending`de boştur. */
  releasedItems: AdminTradeCancelReleasedItem[];
  /** İptal edilecek, henüz taşıyıcıya geçmemiş kargo etiketi sayısı. */
  labelsToCancel: number;
}

/** `POST /admin/trades/:id/cancel` yanıtı. */
export interface AdminTradeCancelResult {
  tradeId: string;
  /**
   * Aynı iptalin tekrarı (çift gönderim): takas bu kodla zaten platform
   * tarafından iptal edilmiş — ikinci kez para, bildirim ya da denetim yok.
   */
  alreadyCancelled: boolean;
  refunds: AdminTradeCancelRefundLine[];
  /**
   * İade sağlayıcıda başarısız oldu: takas iptal edildi, iade
   * `refundFailureReason` işaretiyle "İadeyi yeniden dene" yoluna düştü.
   */
  refundFailed: boolean;
}
