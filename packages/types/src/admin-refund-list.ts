import type { RefundRequestKind } from "./admin-cancellations";
import { ADMIN_CANCEL_REASON_I18N_KEYS } from "./admin-cancellation";
import type {
  RefundAttemptStatusValue,
  RefundRequestStatusValue,
  ShipmentStatusValue,
  TradeStatusValue,
} from "./commerce-status";

/**
 * Admin "İadeler" ekranı — sekme + alt sekme (kova) sözlüğü, kova kuralı ve
 * liste sözleşmesi. TEK kaynak: API bu tablolardan Prisma `where` üretir
 * (liste, sayaçlar ve Excel aynı builder'ı kullanır), panel sekmeleri ve
 * etiket anahtarlarını buradan okur. Bkz. docs/REFUNDS_SCREEN.md.
 *
 * Satır birimi:
 * - Direkt satış / teklif: İADE TALEBİ (`RefundRequest`, RFD-…). Kargo öncesi
 *   iptalin iadesi de bir taleptir (`kind = cancellation`).
 * - Takas: takasın her TARAFI ayrı satırdır — "takas başlatan" ve "takas
 *   devam ettiren" iki satır, aynı `trade.tradeId`'yi paylaşır. Takasın iade
 *   talebi yoktur; para tarafın `TradeCashPayment` satırından iade edilir.
 */

/** Ekranın adresi; üst sekme (`?tab=`) ve alt sekme (`?bucket=`) sorguda yaşar. */
export const ADMIN_REFUNDS_PATH = "/operations/refunds";

/** Üst sekmeler: satırın kökeni (sipariş kökeni ya da takas). */
export const ADMIN_REFUND_TABS = ["all", "direct", "offer", "trade"] as const;

export type AdminRefundTab = (typeof ADMIN_REFUND_TABS)[number];

/**
 * Alt sekmeler (kovalar), ekrandaki sırayla. "Tümü" süzgeç uygulamaz; geri
 * kalan yedisi birbirini dışlar ve kapsamdaki her satırı kapsar
 * (`refundRequestBucketOf` / `tradeRefundBucketOf`).
 */
export const ADMIN_REFUND_BUCKETS = [
  "all",
  "pending_review",
  "awaiting_return",
  "at_warehouse",
  "refunding",
  "completed",
  "rejected",
  "disputed",
] as const;

export type AdminRefundBucket = (typeof ADMIN_REFUND_BUCKETS)[number];

export const ADMIN_REFUND_ALL_BUCKET = "all" satisfies AdminRefundBucket;

/** Satırları gerçekten süzen kovalar ("Tümü" dışındakiler). */
export type AdminRefundFilterBucket = Exclude<
  AdminRefundBucket,
  typeof ADMIN_REFUND_ALL_BUCKET
>;

export const ADMIN_REFUND_TAB_I18N_KEYS = {
  all: "admin.operations.refunds.tabs.all",
  direct: "admin.operations.refunds.tabs.direct",
  offer: "admin.operations.refunds.tabs.offer",
  trade: "admin.operations.refunds.tabs.trade",
} as const satisfies Record<AdminRefundTab, string>;

export const ADMIN_REFUND_BUCKET_I18N_KEYS = {
  all: "admin.operations.refunds.buckets.all",
  pending_review: "admin.operations.refunds.buckets.pendingReview",
  awaiting_return: "admin.operations.refunds.buckets.awaitingReturn",
  at_warehouse: "admin.operations.refunds.buckets.atWarehouse",
  refunding: "admin.operations.refunds.buckets.refunding",
  completed: "admin.operations.refunds.buckets.completed",
  rejected: "admin.operations.refunds.buckets.rejected",
  disputed: "admin.operations.refunds.buckets.disputed",
} as const satisfies Record<AdminRefundBucket, string>;

export function isAdminRefundTab(value: unknown): value is AdminRefundTab {
  return (ADMIN_REFUND_TABS as readonly unknown[]).includes(value);
}

export function isAdminRefundBucket(
  value: unknown,
): value is AdminRefundBucket {
  return (ADMIN_REFUND_BUCKETS as readonly unknown[]).includes(value);
}

/** Tanınmayan sekme (eski yer imi, elle yazılmış URL) "Tüm İadeler"e düşer. */
export function resolveAdminRefundTab(value: unknown): AdminRefundTab {
  return isAdminRefundTab(value) ? value : "all";
}

/** Tanınmayan alt sekme "Tümü"ne düşer. */
export function resolveAdminRefundBucket(value: unknown): AdminRefundBucket {
  return isAdminRefundBucket(value) ? value : ADMIN_REFUND_ALL_BUCKET;
}

// ── Köken ────────────────────────────────────────────────────────────────────

export const ADMIN_REFUND_ORIGINS = ["direct", "offer", "trade"] as const;

export type AdminRefundOrigin = (typeof ADMIN_REFUND_ORIGINS)[number];

export const ADMIN_REFUND_ORIGIN_I18N_KEYS = {
  direct: "admin.operations.refunds.origin.direct",
  offer: "admin.operations.refunds.origin.offer",
  trade: "admin.operations.refunds.origin.trade",
} as const satisfies Record<AdminRefundOrigin, string>;

/**
 * Sekmenin kaynakları: hangi sipariş kökenlerinin iade talepleri ve takas
 * satırları listelenir. "Direkt satış" teklif olmayan her siparişi kapsar
 * (platform hizmeti siparişinin iade talebi olmaz; olursa burada görünür).
 */
export const ADMIN_REFUND_TAB_SOURCES = {
  all: { requestOrigins: ["direct", "offer"], trades: true },
  direct: { requestOrigins: ["direct"], trades: false },
  offer: { requestOrigins: ["offer"], trades: false },
  trade: { requestOrigins: [], trades: true },
} as const satisfies Record<
  AdminRefundTab,
  {
    requestOrigins: readonly Exclude<AdminRefundOrigin, "trade">[];
    trades: boolean;
  }
>;

// ── Kova kuralı ──────────────────────────────────────────────────────────────

/**
 * Sürmekte olan sağlayıcı iadesi: hazırlandı / gönderiliyor / sağlayıcıda
 * başarılı ama kesinleşmedi / başarısız (yeniden denenecek) / manuel inceleme.
 * `finalized` burada YOK — kesinleşmiş deneme iadeyi sürdürmez.
 */
export const REFUND_ATTEMPT_IN_FLIGHT_STATUSES = [
  "prepared",
  "submitting",
  "succeeded",
  "failed",
  "manual_review",
] as const satisfies readonly RefundAttemptStatusValue[];

/**
 * Durumu TEK BAŞINA kovayı belirleyen iade talepleri. Talep `cancelled`
 * (alıcı vazgeçti / yönetici iadesiz kapattı) para iadesi olmadan kapanmıştır:
 * "Reddedilen" kovasında durur.
 */
export const REFUND_REQUEST_STATUS_BUCKETS = {
  pending_review: ["pending_review"],
  rejected: ["rejected", "cancelled"],
  completed: ["refunded"],
  disputed: ["disputed"],
} as const satisfies Partial<
  Record<AdminRefundFilterBucket, readonly RefundRequestStatusValue[]>
>;

/**
 * Onaylanmış, iadesi sürmekte olan talepler — kovaları iade denemesinden,
 * talebin türünden ve iade kargosundan çözülür. `REFUND_REQUEST_STATUS_BUCKETS`
 * ile birlikte her durumu TAM OLARAK bir kez kapsar.
 */
export const REFUND_REQUEST_OPEN_STATUSES = [
  "approved",
  "wait_for_delivery",
  "return_shipment_open",
  "return_in_transit",
  "return_delivered",
] as const satisfies readonly RefundRequestStatusValue[];

/** Ürünün bize (satıcıya) ulaştığını söyleyen talep durumu. */
export const REFUND_REQUEST_ARRIVED_STATUSES = [
  "return_delivered",
] as const satisfies readonly RefundRequestStatusValue[];

/**
 * İade kargosunun ulaştığı durum. Kargo `delivered` olup talep henüz
 * `return_delivered`'a geçmemişse de ürün bizdedir (poller birazdan çevirir).
 */
export const REFUND_RETURN_ARRIVED_SHIPMENT_STATUSES = [
  "delivered",
] as const satisfies readonly ShipmentStatusValue[];

/** Kova kuralının okuduğu talep bilgisi. */
export interface RefundRequestBucketState {
  status: RefundRequestStatusValue;
  kind: RefundRequestKind;
  /** Talebin (tek) sağlayıcı iade denemesinin durumu; deneme yoksa null. */
  refundAttemptStatus: RefundAttemptStatusValue | null;
  returnStatus: ShipmentStatusValue | null;
}

const includes = <T extends string>(list: readonly T[], value: unknown) =>
  (list as readonly unknown[]).includes(value);

/**
 * İade talebinin kovası — API'nin Prisma `where`'lerinin düz okuması (contract
 * spec ikisini her durum × deneme × iade kargosu × tür kombinasyonunda
 * karşılaştırır). Öncelik sırası:
 *
 * 1. Durumu tek başına belirleyenler: incelemede / reddedilen (iptal dahil) /
 *    tamamlanan / itirazlı.
 * 2. Açık talepte süren sağlayıcı iadesi → "İade Ediliyor".
 * 3. Kargo öncesi iptalin iadesi (iade bacağı yok) → doğrudan "İade Ediliyor".
 * 4. Ürün bize ulaştı (talep `return_delivered` ya da iade kargosu teslim) →
 *    "Depoda / İncelemede".
 * 5. Kalan açık ürün iadesi → "İade Bekleniyor" (kargo yok / yolda).
 */
export function refundRequestBucketOf(
  state: RefundRequestBucketState,
): AdminRefundFilterBucket {
  for (const [bucket, statuses] of Object.entries(
    REFUND_REQUEST_STATUS_BUCKETS,
  ) as [AdminRefundFilterBucket, readonly RefundRequestStatusValue[]][]) {
    if (includes(statuses, state.status)) return bucket;
  }
  if (includes(REFUND_ATTEMPT_IN_FLIGHT_STATUSES, state.refundAttemptStatus)) {
    return "refunding";
  }
  if (state.kind === "cancellation") return "refunding";
  if (
    includes(REFUND_REQUEST_ARRIVED_STATUSES, state.status) ||
    includes(REFUND_RETURN_ARRIVED_SHIPMENT_STATUSES, state.returnStatus)
  ) {
    return "at_warehouse";
  }
  return "awaiting_return";
}

/** İtirazdaki takas. */
export const TRADE_REFUND_DISPUTED_STATUSES = [
  "disputed",
] as const satisfies readonly TradeStatusValue[];

/**
 * Ürünler Tarodan deposunda (kontrol) ya da depodan sahiplerine dönüyor
 * (depo reddi → `returning`).
 */
export const TRADE_REFUND_AT_WAREHOUSE_STATUSES = [
  "at_warehouse",
  "admin_reviewing",
  "returning",
] as const satisfies readonly TradeStatusValue[];

/** Kapanmış takas: iade sonuçlandı (ya da iade edilecek bakiye kalmadı). */
export const TRADE_REFUND_CLOSED_STATUSES = [
  "cancelled",
  "completed",
  "rejected",
] as const satisfies readonly TradeStatusValue[];

/** Takas kovasının okuduğu bilgi (iki taraf satırı aynı kovadadır). */
export interface TradeRefundBucketState {
  status: TradeStatusValue;
  /** Takasta iade hata işareti var (`Trade.refundFailureReason`). */
  refundFailed: boolean;
  /** Takasın süren bir sağlayıcı iade denemesi var. */
  hasInFlightRefundAttempt: boolean;
}

/**
 * Takas satırının kovası — API'nin takas `where`'lerinin düz okuması.
 * Takasın inceleme / ret kovası yoktur (iade talebi yok). Öncelik sırası:
 *
 * 1. İtirazdaki takas → "İtirazlı".
 * 2. İade hata işareti ya da süren deneme → "İade Ediliyor".
 * 3. Depoda / depodan dönüşte → "Depoda / İncelemede".
 * 4. Kapanmış → "Tamamlanan".
 * 5. Kalan (depoya ulaşmamış) → "İade Bekleniyor".
 */
export function tradeRefundBucketOf(
  state: TradeRefundBucketState,
): AdminRefundFilterBucket {
  if (includes(TRADE_REFUND_DISPUTED_STATUSES, state.status)) return "disputed";
  if (state.refundFailed || state.hasInFlightRefundAttempt) return "refunding";
  if (includes(TRADE_REFUND_AT_WAREHOUSE_STATUSES, state.status)) {
    return "at_warehouse";
  }
  if (includes(TRADE_REFUND_CLOSED_STATUSES, state.status)) return "completed";
  return "awaiting_return";
}

// ── Para durumu ──────────────────────────────────────────────────────────────

/**
 * Satırın iade parası.
 * - none: iade edilecek para yok (tahsilat yok, talep reddedildi/kapatıldı,
 *   ya da kesintiler sonrası bakiye kalmadı).
 * - pending: iade bekleniyor (henüz sağlayıcıya gidilmedi).
 * - refunding: sağlayıcı iadesi sürüyor (gönderildi / kesinleşiyor / manuel).
 * - refunded: iade kesinleşti.
 * - failed: sağlayıcı iadesi başarısız — yeniden denenecek.
 */
export const ADMIN_REFUND_MONEY_STATUSES = [
  "none",
  "pending",
  "refunding",
  "refunded",
  "failed",
] as const;

export type AdminRefundMoneyStatus =
  (typeof ADMIN_REFUND_MONEY_STATUSES)[number];

export const ADMIN_REFUND_MONEY_STATUS_I18N_KEYS = {
  none: "admin.operations.refunds.moneyStatus.none",
  pending: "admin.operations.refunds.moneyStatus.pending",
  refunding: "admin.operations.refunds.moneyStatus.refunding",
  refunded: "admin.operations.refunds.moneyStatus.refunded",
  failed: "admin.operations.refunds.moneyStatus.failed",
} as const satisfies Record<AdminRefundMoneyStatus, string>;

/** Bir iade denemesinin para durumu. */
export function refundAttemptMoneyStatus(
  status: RefundAttemptStatusValue,
): Exclude<AdminRefundMoneyStatus, "none" | "pending"> {
  if (status === "finalized") return "refunded";
  if (status === "failed") return "failed";
  return "refunding";
}

// ── Takas tarafı ve depo kararı ──────────────────────────────────────────────

/** initiator = takas başlatan, responder = takas devam ettiren (ilan sahibi). */
export const ADMIN_REFUND_TRADE_ROLES = ["initiator", "responder"] as const;

export type AdminRefundTradeRole = (typeof ADMIN_REFUND_TRADE_ROLES)[number];

export const ADMIN_REFUND_TRADE_ROLE_I18N_KEYS = {
  initiator: "admin.operations.refunds.tradeRole.initiator",
  responder: "admin.operations.refunds.tradeRole.responder",
} as const satisfies Record<AdminRefundTradeRole, string>;

/** Tarodan depo kararı: kontrol sürüyor / onaylandı / reddedildi. */
export const ADMIN_REFUND_WAREHOUSE_DECISIONS = [
  "pending",
  "approved",
  "rejected",
] as const;

export type AdminRefundWarehouseDecision =
  (typeof ADMIN_REFUND_WAREHOUSE_DECISIONS)[number];

export const ADMIN_REFUND_WAREHOUSE_DECISION_I18N_KEYS = {
  pending: "admin.operations.refunds.warehouseDecision.pending",
  approved: "admin.operations.refunds.warehouseDecision.approved",
  rejected: "admin.operations.refunds.warehouseDecision.rejected",
} as const satisfies Record<AdminRefundWarehouseDecision, string>;

// ── Neden ve durum etiketleri ────────────────────────────────────────────────

/**
 * Satırın neden kodunun katalog anahtarı. Talepte kod alıcının (ya da
 * incelemenin) `RefundReason`'ıdır; takasta yönetici iptalinin katalog
 * kodudur. Kod yoksa null — serbest metin `reason.note`'tadır.
 */
export function adminRefundReasonI18nKey(
  origin: AdminRefundOrigin,
  code: string | null,
): string | null {
  if (!code) return null;
  if (origin !== "trade") return `status.refundReason.${code}`;
  return (
    (ADMIN_CANCEL_REASON_I18N_KEYS as Record<string, string | undefined>)[
      code
    ] ?? null
  );
}

/** Satır durumunun katalog anahtarı: talep durumu ya da takas durumu. */
export function adminRefundStatusI18nKey(
  origin: AdminRefundOrigin,
  status: string,
): string {
  return origin === "trade"
    ? `status.trade.${status}`
    : `status.refundRequest.${status}`;
}

// ── Liste sözleşmesi ─────────────────────────────────────────────────────────

export interface AdminRefundParty {
  id: string;
  name: string;
  /** Panel kullanıcı kodu (B…/K…); misafir alıcıda null. */
  code: string | null;
}

/**
 * `GET /admin/refund-requests` satırı. Para alanları sayıdır (sunucu Decimal
 * ile hesaplar, sınırda çevirir); kaynakları docs/REFUNDS_SCREEN.md'de.
 */
export interface AdminRefundRow {
  /** Talep id'si; takasta `<tradeId>:<role>` (satır anahtarı, dosya id'si değil). */
  id: string;
  /** RFD-…; takasta `TKS-…-INI` / `TKS-…-REC` (tarafın türetilmiş numarası). */
  refundNo: string;
  /** Talep anı; takasta iadenin başladığı an. */
  createdAt: string;
  kind: RefundRequestKind;
  origin: AdminRefundOrigin;
  /** Test şeridi kaydı — panel "TEST" rozeti basar (liste gizlemez). */
  isTest: boolean;
  /** Sipariş; takasta takasın kendisi (`id` = takas id, `orderNumber` = TKS-…). */
  order: {
    id: string;
    orderNumber: string;
    createdAt: string;
    groupNumber?: string | null;
    /** Gidiş kolisinin takip no'su (takasta tarafın depoya giden kolisi). */
    packageTrackingNo?: string | null;
  };
  /** Talep eden alıcı; takasta bu satırın tarafı. */
  buyer: AdminRefundParty;
  /** Satıcı; takasta karşı taraf. */
  seller: AdminRefundParty;
  product: {
    id: string;
    title: string;
    productCode: string | null;
    quantity: number;
    refundQuantity: number;
  };
  money: {
    unitPrice: number;
    /** Etkin satış komisyonu oranı (%) = komisyon ÷ ürün tabanı; takasta null. */
    commissionRate: number | null;
    /** Satış komisyonu (alıcı + satıcı, KDV hariç); takasta hizmet bedeli. */
    commissionAmount: number | null;
    refundableCommissionRate: number | null;
    refundableCommissionAmount: number | null;
    /** Teklif: ilan fiyatından komisyon (etkin oranla, bkz. doküman). */
    listingCommissionAmount?: number | null;
    /** Teklif: teklif fiyatından alınan komisyon. */
    offerCommissionAmount?: number | null;
    /** Teklif: ilan − teklif; takas: + bu taraf ödedi, − bu tarafa ödendi. */
    priceDifference?: number | null;
    buyerDeduction: number;
    sellerDeduction: number;
    refundAmount: number;
    status: AdminRefundMoneyStatus;
    refundedAt: string | null;
  };
  returnShipment: { trackingNo: string | null; status: string | null } | null;
  /** Yalnız takas. */
  warehouse?: {
    arrivalStatus: string | null;
    decision: AdminRefundWarehouseDecision | null;
    outboundAt: string | null;
    outboundLabelUrl: string | null;
    returnToCustomersStatus: string | null;
  } | null;
  reason: { code: string | null; label: string | null; note: string | null };
  /** Talep durumu (`RefundRequestStatus`) ya da takas durumu (`TradeStatus`). */
  status: string;
  /** Sonuçlanma anı (iade / ret / kapanış); açık satırda null. */
  completedAt: string | null;
  returnInvoice: { id: string; number: string | null; status: string } | null;
  /** Takas satırları İKİ satır gelir (taraf başına), aynı `tradeId`'yi paylaşır. */
  trade?: {
    tradeId: string;
    tradeNumber: string;
    role: AdminRefundTradeRole;
    counterpartRefundId: string | null;
  } | null;
}

/** `GET /admin/refund-requests/counts?tab=` — sekmenin kova sayaçları. */
export type AdminRefundCounts = Record<AdminRefundBucket, number>;
