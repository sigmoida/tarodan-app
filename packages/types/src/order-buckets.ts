import type {
  OfferStatusValue,
  OrderStatusValue,
  ShipmentStatusValue,
} from "./commerce-status";

/**
 * Admin sipariş ekranının sekme + alt sekme (kova) sözlüğü — TEK kaynak.
 *
 * API bu tablolardan Prisma `where` üretir (liste ve sayaçlar aynı builder'ı
 * kullanır), panel sekmeleri ve etiket anahtarlarını buradan okur. Bir kovanın
 * tanımı değişirse yalnız burası değişir.
 *
 * Satır birimi SEPETTİR: doğrudan satışta CheckoutGroup (GRP), teklifte tekil
 * sipariş (ORD). Teklif sekmesinin "Bekleyen" / "Süresi Dolan" kovalarında
 * henüz sipariş olmayabileceği için satır teklifin kendisidir.
 */

export const ADMIN_ORDER_TABS = ["all", "direct_sale", "offer"] as const;

export type AdminOrderTab = (typeof ADMIN_ORDER_TABS)[number];

export const ADMIN_ORDER_BUCKETS = [
  "all",
  "new",
  "pending",
  "expired",
  "shipped",
  "in_transit",
  "delivered",
  "other",
] as const;

export type AdminOrderBucket = (typeof ADMIN_ORDER_BUCKETS)[number];

/**
 * "Tümü": kova filtresi UYGULAMAYAN alt sekme — sekmenin bütün satırları.
 * Kova hiç verilmemiş istekle aynı anlamdadır; sayacı sekmenin toplamıdır.
 */
export const ADMIN_ORDER_ALL_BUCKET = "all" satisfies AdminOrderBucket;

/** Satırları gerçekten süzen kovalar ("Tümü" dışındakiler). */
export type AdminOrderFilterBucket = Exclude<
  AdminOrderBucket,
  typeof ADMIN_ORDER_ALL_BUCKET
>;

/**
 * Kapsamsız açılışın alt sekmesi: operasyonun iş kuyruğu "Yeni". Kullanıcı /
 * ürün deep-link'i ise "Tümü"nde açılır (bkz. panel `useOrderTabs`).
 */
export const ADMIN_ORDER_DEFAULT_BUCKET = "new" satisfies AdminOrderBucket;

/** Kovanın süzgeci: "Tümü" (ya da kova yok) süzgeç yok demektir. */
export function adminOrderBucketFilter(
  bucket: AdminOrderBucket | undefined,
): AdminOrderFilterBucket | undefined {
  return bucket === ADMIN_ORDER_ALL_BUCKET ? undefined : bucket;
}

/**
 * Bir sipariş satırının (Order) ilerleme aşamaları, İLERLEME SIRASIYLA.
 * Sıra anlamlıdır: çok satıcılı sepet en GERİDEKİ paketinin aşamasına düşer.
 * Hiçbir aşamaya uymayan satır "other"dır (ödeme bekleyen, iptal, iade, kargo
 * hatası…) — yani aşamalar + other her siparişi tam olarak bir kez kapsar.
 */
export const ORDER_LINE_STAGES = [
  "new",
  "shipped",
  "in_transit",
  "delivered",
] as const;

export type OrderLineStage = (typeof ORDER_LINE_STAGES)[number];

export interface OrderLineStageRule {
  orderStatuses: readonly OrderStatusValue[];
  /**
   * Aşama kargo durumuna da bakıyorsa: izin verilen kargo durumları ve kargo
   * kaydı hiç yokken satırın bu aşamada sayılıp sayılmayacağı.
   */
  shipment?: {
    statuses: readonly ShipmentStatusValue[];
    allowMissing: boolean;
  };
}

/**
 * - new: ödenmiş ama kargoya verilmemiş. Kargo durumuna bakılmaz — siparişi
 *   `shipped`'e çeviren yazıcılar kargo satırıyla AYNI transaction'da çevirir,
 *   dolayısıyla ödenmiş sipariş hareket görmüş kargoyla kalmaz; iptal edilip
 *   yeniden açılmış bir etiket de "yeni iş"tir.
 * - shipped (Kargoya Verilen): gönderi oluştu/teslim alındı, henüz yolda değil.
 * - in_transit (Taşıma Durumunda): yolda / dağıtımda. Kargo `delivered` ama
 *   sipariş henüz geçmemişse de burada durur (teslim handler'ı birazdan çevirir).
 * - delivered (Teslim Edilen): teslim + onay penceresi + tamamlanmış.
 * Kargosu hata/iade/iptal olmuş `shipped` sipariş "other"a düşer.
 */
export const ORDER_LINE_STAGE_RULES: Record<
  OrderLineStage,
  OrderLineStageRule
> = {
  new: { orderStatuses: ["paid", "preparing"] },
  shipped: {
    orderStatuses: ["shipped"],
    shipment: {
      statuses: ["pending", "label_created", "picked_up"],
      allowMissing: true,
    },
  },
  in_transit: {
    orderStatuses: ["shipped"],
    shipment: {
      statuses: [
        "in_transit",
        "at_delivery_branch",
        "out_for_delivery",
        "delivered",
      ],
      allowMissing: false,
    },
  },
  delivered: {
    orderStatuses: ["delivered", "awaiting_buyer_confirmation", "completed"],
  },
};

/**
 * Teklif sekmesinin siparişe dönmemiş kovaları.
 * - pending (Bekleyen): süresi geçmemiş açık teklif ya da kabul edilmiş ama
 *   siparişi henüz ödenmemiş teklif.
 * - expired (Süresi Dolan): cron'un `expired`'a çektiği, süresi geçtiği hâlde
 *   henüz çekilmemiş `pending` ve ödeme süresi dolmuş (`payment_expired`) teklif.
 */
export const OFFER_PENDING_RULE = {
  openStatuses: ["pending"] as readonly OfferStatusValue[],
  acceptedStatuses: ["accepted"] as readonly OfferStatusValue[],
  unpaidOrderStatuses: ["pending_payment"] as readonly OrderStatusValue[],
} as const;

export const OFFER_EXPIRED_RULE = {
  statuses: ["expired", "payment_expired"] as readonly OfferStatusValue[],
  /** `expiresAt` geçmişse süresi dolmuş sayılan durumlar. */
  lapsedStatuses: ["pending"] as readonly OfferStatusValue[],
} as const;

/** Sekme → alt sekmeler, ekrandaki sırayla. Her sekme "Tümü" ile başlar. */
export const ADMIN_ORDER_TAB_BUCKETS: Record<
  AdminOrderTab,
  readonly AdminOrderBucket[]
> = {
  all: ["all", "new", "shipped", "in_transit", "delivered", "other"],
  direct_sale: ["all", "new", "shipped", "in_transit", "delivered", "other"],
  offer: [
    "all",
    "new",
    "pending",
    "expired",
    "shipped",
    "in_transit",
    "delivered",
    "other",
  ],
};

export const ADMIN_ORDER_TAB_I18N_KEYS = {
  all: "admin.operations.orders.tabs.all",
  direct_sale: "admin.operations.orders.tabs.directSale",
  offer: "admin.operations.orders.tabs.offers",
} as const satisfies Record<AdminOrderTab, string>;

export const ADMIN_ORDER_BUCKET_I18N_KEYS = {
  all: "admin.operations.orders.buckets.all",
  new: "admin.operations.orders.buckets.new",
  pending: "admin.operations.orders.buckets.pending",
  expired: "admin.operations.orders.buckets.expired",
  shipped: "admin.operations.orders.buckets.shipped",
  in_transit: "admin.operations.orders.buckets.inTransit",
  delivered: "admin.operations.orders.buckets.delivered",
  other: "admin.operations.orders.buckets.other",
} as const satisfies Record<AdminOrderBucket, string>;

export function isAdminOrderTab(value: unknown): value is AdminOrderTab {
  return (ADMIN_ORDER_TABS as readonly unknown[]).includes(value);
}

export function isAdminOrderBucketOfTab(
  tab: AdminOrderTab,
  bucket: unknown,
): bucket is AdminOrderBucket {
  return (ADMIN_ORDER_TAB_BUCKETS[tab] as readonly unknown[]).includes(bucket);
}

/** Tanınmayan sekme (eski yer imi, elle yazılmış URL) "Tüm Siparişler"e düşer. */
export function resolveAdminOrderTab(value: unknown): AdminOrderTab {
  return isAdminOrderTab(value) ? value : "all";
}

/**
 * Sekmede olmayan (ya da hiç verilmemiş) kova `fallback`'e düşer — varsayılan
 * "Tümü", yani süzgeçsiz liste.
 */
export function resolveAdminOrderBucket(
  tab: AdminOrderTab,
  value: unknown,
  fallback: AdminOrderBucket = ADMIN_ORDER_ALL_BUCKET,
): AdminOrderBucket {
  return isAdminOrderBucketOfTab(tab, value) ? value : fallback;
}

/**
 * Tek bir sipariş satırının aşaması — `ORDER_LINE_STAGE_RULES`'un düz okuması.
 * Kurallar birbirini dışladığı için ilk eşleşme tek eşleşmedir; hiçbiri
 * eşleşmezse "other".
 */
export function orderLineStageOf(
  orderStatus: OrderStatusValue,
  shipmentStatus: ShipmentStatusValue | null,
): OrderLineStage | "other" {
  for (const stage of ORDER_LINE_STAGES) {
    const rule = ORDER_LINE_STAGE_RULES[stage];
    if (!rule.orderStatuses.includes(orderStatus)) continue;
    if (!rule.shipment) return stage;
    if (shipmentStatus === null) {
      if (rule.shipment.allowMissing) return stage;
      continue;
    }
    if (rule.shipment.statuses.includes(shipmentStatus)) return stage;
  }
  return "other";
}
