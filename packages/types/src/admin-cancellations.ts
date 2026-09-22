import type {
  AdminOrderFees,
  AdminOrderOfferInfo,
  AdminOrderPackage,
  AdminOrderParty,
} from "./admin-order-list";
import type { CancellationActorValue } from "./commerce-status";

/**
 * Admin "İptal & İade" ekranının İptaller sekmesi — sekme + alt sekme sözlüğü
 * ve liste sözleşmesi. TEK kaynak: API bu tablolardan Prisma `where` üretir
 * (liste ve sayaçlar aynı builder'ı kullanır), panel sekmeleri ve etiket
 * anahtarlarını buradan okur.
 *
 * Satır birimi siparişler ekranıyla aynıdır: doğrudan satışta sepet (GRP),
 * teklifte sipariş (ORD), takasta takasın kendisi. Satır YALNIZ iptal edilmiş
 * kalemlerini taşır — kısmen iptal edilmiş bir sepette yalnız iptal kalemleri.
 */

/** Ekranın adresi; üst sekme (`?view=cancellations|refunds`) sorguda yaşar. */
export const ADMIN_CANCELLATIONS_REFUNDS_PATH =
  "/operations/cancellations-refunds";

/** İadeler sekmesi — eski `/operations/refund-requests` listesinin yeni yeri. */
export const ADMIN_REFUNDS_VIEW_HREF = `${ADMIN_CANCELLATIONS_REFUNDS_PATH}?view=refunds`;

export const ADMIN_CANCELLATION_TABS = [
  "all",
  "direct_sale",
  "offer",
  "trade",
] as const;

export type AdminCancellationTab = (typeof ADMIN_CANCELLATION_TABS)[number];

/**
 * Alt sekmeler. "Tümü" süzgeç uygulamaz; "Yeni" iptal anına bakar; diğerleri
 * iptalin aktörüne. Aktörü bilinmeyen (null) iptal yalnız Tümü / Yeni'de
 * görünür — aktör sekmeleri bilinmeyeni uydurmaz.
 */
export const ADMIN_CANCELLATION_BUCKETS = [
  "all",
  "new",
  "buyer",
  "seller",
  "platform",
] as const;

export type AdminCancellationBucket =
  (typeof ADMIN_CANCELLATION_BUCKETS)[number];

export const ADMIN_CANCELLATION_ALL_BUCKET =
  "all" satisfies AdminCancellationBucket;

/** "Yeni": iptal anı son 24 saat içinde. */
export const ADMIN_CANCELLATION_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Aktör sekmelerinin kapsadığı aktörler. "Tarodan İptali" yönetici kararı ile
 * otomatik (sistem) iptali birlikte gösterir — süre dolumları da buradadır.
 */
export const ADMIN_CANCELLATION_BUCKET_ACTORS = {
  buyer: ["buyer"],
  seller: ["seller"],
  platform: ["platform", "system"],
} as const satisfies Record<
  Exclude<AdminCancellationBucket, "all" | "new">,
  readonly CancellationActorValue[]
>;

export const ADMIN_CANCELLATION_TAB_I18N_KEYS = {
  all: "admin.operations.cancellations.tabs.all",
  direct_sale: "admin.operations.cancellations.tabs.directSale",
  offer: "admin.operations.cancellations.tabs.offers",
  trade: "admin.operations.cancellations.tabs.trades",
} as const satisfies Record<AdminCancellationTab, string>;

export const ADMIN_CANCELLATION_BUCKET_I18N_KEYS = {
  all: "admin.operations.cancellations.buckets.all",
  new: "admin.operations.cancellations.buckets.new",
  buyer: "admin.operations.cancellations.buckets.buyer",
  seller: "admin.operations.cancellations.buckets.seller",
  platform: "admin.operations.cancellations.buckets.platform",
} as const satisfies Record<AdminCancellationBucket, string>;

export function isAdminCancellationTab(
  value: unknown,
): value is AdminCancellationTab {
  return (ADMIN_CANCELLATION_TABS as readonly unknown[]).includes(value);
}

export function isAdminCancellationBucket(
  value: unknown,
): value is AdminCancellationBucket {
  return (ADMIN_CANCELLATION_BUCKETS as readonly unknown[]).includes(value);
}

/** Tanınmayan sekme (eski yer imi, elle yazılmış URL) "Tüm İptaller"e düşer. */
export function resolveAdminCancellationTab(
  value: unknown,
): AdminCancellationTab {
  return isAdminCancellationTab(value) ? value : "all";
}

/** Tanınmayan alt sekme "Tümü"ne düşer. */
export function resolveAdminCancellationBucket(
  value: unknown,
): AdminCancellationBucket {
  return isAdminCancellationBucket(value)
    ? value
    : ADMIN_CANCELLATION_ALL_BUCKET;
}

// ── İptal nedeni ─────────────────────────────────────────────────────────────

/**
 * Bir iptalin gösterilecek nedeni. API ham alanlardan çözer (alıcının seçtiği
 * kod > süre dolumu sabiti > serbest metin); panel ve Excel aynı çözümü okur.
 */
export type AdminCancellationReason =
  | { kind: "code"; code: string }
  | { kind: "expired" }
  | { kind: "text"; text: string }
  | { kind: "none" };

/** Nedenin metni: katalog anahtarı ya da (serbest metinde) metnin kendisi. */
export type AdminCancellationReasonMessage = { key: string } | { text: string };

export const ADMIN_CANCELLATION_EXPIRED_I18N_KEY =
  "admin.operations.cancellations.reason.expired";

/** Neden boşken gösterilen yer tutucu ("—"). */
export const ADMIN_CANCELLATION_EMPTY_VALUE = "—";

/**
 * Nedenin görüntüsü. Alıcı kodu mağazanın iptal formundaki etiketle aynı
 * katalog anahtarını okur (`status.orderCancellationReason.*`).
 */
export function cancellationReasonMessage(
  reason: AdminCancellationReason,
): AdminCancellationReasonMessage {
  switch (reason.kind) {
    case "code":
      return { key: `status.orderCancellationReason.${reason.code}` };
    case "expired":
      return { key: ADMIN_CANCELLATION_EXPIRED_I18N_KEY };
    case "text":
      return { text: reason.text };
    default:
      return { text: ADMIN_CANCELLATION_EMPTY_VALUE };
  }
}

// ── Aktör ────────────────────────────────────────────────────────────────────

/** İptali yapan; null = bilinmiyor (aktör damgasından önceki iptaller). */
export const ADMIN_CANCELLATION_ACTOR_I18N_KEYS = {
  buyer: "admin.operations.cancellations.actor.buyer",
  seller: "admin.operations.cancellations.actor.seller",
  platform: "admin.operations.cancellations.actor.platform",
  system: "admin.operations.cancellations.actor.system",
  unknown: "admin.operations.cancellations.actor.unknown",
} as const satisfies Record<CancellationActorValue | "unknown", string>;

export function cancellationActorI18nKey(
  actor: CancellationActorValue | null,
): string {
  return ADMIN_CANCELLATION_ACTOR_I18N_KEYS[actor ?? "unknown"];
}

// ── İade durumu ──────────────────────────────────────────────────────────────

/**
 * İptalin para tarafı.
 * - not_charged: hiç tahsilat yok (ödenmemiş sepet, ödemesiz takas).
 * - pending: tahsil edildi, iade henüz yapılmadı.
 * - in_review: iade talebi incelemede / sürüyor.
 * - refunded: iade sağlayıcıda gerçekleşti (kısmi dahil).
 * - failed: iade denendi, başarısız (manuel inceleme bekler).
 */
export const ADMIN_CANCELLATION_REFUND_STATES = [
  "not_charged",
  "pending",
  "in_review",
  "refunded",
  "failed",
] as const;

export type AdminCancellationRefundState =
  (typeof ADMIN_CANCELLATION_REFUND_STATES)[number];

export const ADMIN_CANCELLATION_REFUND_STATE_I18N_KEYS = {
  not_charged: "admin.operations.cancellations.refundState.notCharged",
  pending: "admin.operations.cancellations.refundState.pending",
  in_review: "admin.operations.cancellations.refundState.inReview",
  refunded: "admin.operations.cancellations.refundState.refunded",
  failed: "admin.operations.cancellations.refundState.failed",
} as const satisfies Record<AdminCancellationRefundState, string>;

// ── Liste sözleşmesi ─────────────────────────────────────────────────────────

/** Bir iptal kaleminin iptal bilgisi (sipariş kalemi ya da takas ürünü). */
export interface AdminCancellationInfo {
  /** İptal anı; damgadan önceki iptalde null. */
  cancelledAt: string | null;
  cancelledBy: CancellationActorValue | null;
  reason: AdminCancellationReason;
  refundState: AdminCancellationRefundState;
}

export type AdminCancellationRowKind = "group" | "order" | "trade";

export type AdminCancellationOrigin = "direct_sale" | "offer" | "trade";

/**
 * `GET /admin/cancellations` satırı. Ürün / fiyat / komisyon kolonları
 * siparişler ekranının hücrelerini yeniden kullanır: `packages` aynı paket
 * sözleşmesidir (yalnız iptal kalemleri). Takasta paket = ürün sahibi taraf,
 * kalem = takas ürünü.
 */
export interface AdminCancellationRow {
  kind: AdminCancellationRowKind;
  id: string;
  /** GRP-… / ORD-… / TKS-… */
  number: string;
  origin: AdminCancellationOrigin;
  /** Siparişin / takasın oluşturulma anı. */
  createdAt: string;
  /** Sipariş durumu (grup: kalemlerin durumu) ya da takas durumu. */
  status: string;
  /** Sipariş dosyası (grup buradan çözülür); takasta null. */
  detailOrderId: string | null;
  /** Takas dosyası; siparişte null. */
  tradeId: string | null;
  /** Takasta teklifi açan taraf. */
  buyer: AdminOrderParty;
  /** Kalemlerin satıcıları (takasta ilan sahibi), tekrarsız. */
  sellers: AdminOrderParty[];
  totalAmount: number;
  subtotal: number;
  fees: AdminOrderFees;
  offer: AdminOrderOfferInfo | null;
  packages: AdminOrderPackage[];
  /** Satırın iptal kalemi sayısı / toplam kalem sayısı (kısmi iptal). */
  lineCounts: { cancelled: number; total: number };
  /** Satırın en son iptal anı (sıralama anahtarı). */
  cancelledAt: string | null;
  /** Paket kalemi (`AdminOrderLine.orderId`) → iptal bilgisi. */
  cancellations: Record<string, AdminCancellationInfo>;
}

export interface AdminCancellationTabCounts {
  total: number;
  buckets: Record<AdminCancellationBucket, number>;
}

/** `GET /admin/cancellations/counts` — her sekmenin alt sekme sayaçları. */
export type AdminCancellationCounts = Record<
  AdminCancellationTab,
  AdminCancellationTabCounts
>;

// ── İade talebi türü (İadeler sekmesi) ──────────────────────────────────────

/**
 * Kargo öncesi iptalden doğan iade talepleri `*_cancellation` politikasını
 * taşır (alıcı iptali ve yönetici iptali); geri kalanı ürün iadesidir.
 */
export const REFUND_CANCELLATION_POLICY_SUFFIX = "_cancellation";

export const REFUND_REQUEST_KINDS = ["cancellation", "return"] as const;

export type RefundRequestKind = (typeof REFUND_REQUEST_KINDS)[number];

export const REFUND_REQUEST_KIND_I18N_KEYS = {
  cancellation: "admin.operations.refundRequests.kind.cancellation",
  return: "admin.operations.refundRequests.kind.return",
} as const satisfies Record<RefundRequestKind, string>;

export function refundRequestKindOf(
  policyCode: string | null | undefined,
): RefundRequestKind {
  return policyCode?.endsWith(REFUND_CANCELLATION_POLICY_SUFFIX)
    ? "cancellation"
    : "return";
}

export function isRefundRequestKind(
  value: unknown,
): value is RefundRequestKind {
  return (REFUND_REQUEST_KINDS as readonly unknown[]).includes(value);
}
