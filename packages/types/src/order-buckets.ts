import type {
  OrderOriginValue,
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
 * sipariş (ORD). Burada yalnız SİPARİŞ satırı taşıyan sekmeler vardır; aynı
 * ekrandaki Teklifler (siparişe dönmemişler dahil bütün teklifler) ve Takaslar
 * sekmeleri kendi listelerini okur (bkz. `admin-orders-screen.ts`).
 */

/**
 * Sipariş satırı taşıyan sekmeler: tüm siparişler, doğrudan satış ve siparişe
 * dönen teklifler (`offer_order` — teklif kaynaklı ORD'ler).
 */
export const ADMIN_ORDER_TABS = ["all", "direct_sale", "offer_order"] as const;

export type AdminOrderTab = (typeof ADMIN_ORDER_TABS)[number];

export const ADMIN_ORDER_BUCKETS = [
  "all",
  "new",
  "shipped",
  "in_transit",
  "delivered",
  "cancelled",
  "refunds",
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
 * ürün deep-link'i ise "Tümü"nde açılır (bkz. panel `useOrderBucket`).
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
 * Hiçbir aşamaya uymayan satır KAPANMIŞ satırdır (iptal, iade, ödeme bekleyen,
 * kargo hatası…); hiçbir satırı aşamada olmayan sepet `ORDER_CLOSED_BUCKETS`
 * kurallarıyla İptaller / İadeler / Diğer'den TAM OLARAK birine düşer.
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
 * Kargosu hata/iade/iptal olmuş `shipped` sipariş hiçbir aşamada değildir.
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
 * KAPANMIŞ sepetlerin kovaları — hiçbir satırı bir ilerleme aşamasında olmayan
 * sepetler, ekrandaki sırayla. Öncelik sırası bu sıra DEĞİLDİR; karar
 * `orderCartBucketOf`'ta: önce iade, sonra iptal, kalan "Diğer".
 *
 * - refunds (İadeler): en az bir satırda iade izi var — iade talebi açılmış /
 *   iade edilmiş sipariş ya da geri dönen (dönmekte olan) koli.
 * - cancelled (İptaller): iade izi yok ve satırların TAMAMI iptal. İptal
 *   satırının yanında ödenmemiş ya da kargosu hata vermiş bir satır varsa o
 *   satır hâlâ bakılacak iştir; sepet "Diğer"de kalır.
 * - other (Diğer): kalan her şey — ödeme bekleyen/terk edilmiş sepet, kargosu
 *   hata vermiş ya da iptal edilmiş `shipped` sipariş…
 *
 * Üç kova birbirini dışlar ve kapanmış sepetlerin tamamını kapsar: sayaçların
 * toplamı yine sepet sayısına eşittir.
 */
export const ORDER_CLOSED_BUCKETS = ["cancelled", "refunds", "other"] as const;

export type OrderClosedBucket = (typeof ORDER_CLOSED_BUCKETS)[number];

/** Bir sepetin kovası: ilerleme aşaması ya da kapanmış kovalardan biri. */
export type OrderCartBucket = OrderLineStage | OrderClosedBucket;

/** İade izi taşıyan satır: sipariş durumu ya da kolinin durumu yeter. */
export const ORDER_REFUND_LINE_RULE = {
  orderStatuses: ["refund_requested", "refunded"],
  shipmentStatuses: ["return_in_progress", "returned"],
} as const satisfies {
  orderStatuses: readonly OrderStatusValue[];
  shipmentStatuses: readonly ShipmentStatusValue[];
};

/** İptal satırı. */
export const ORDER_CANCELLED_LINE_STATUSES = [
  "cancelled",
] as const satisfies readonly OrderStatusValue[];

/**
 * Sekmenin kapsadığı sipariş kökenleri — listenin ve sayaçların kaynağı.
 * Teklif siparişi grupsuz tekil siparişidir; CheckoutGroup kaynağı yalnız
 * doğrudan satışı taşır (bkz. API `orderListSourceWheres`).
 */
export const ADMIN_ORDER_TAB_ORIGINS: Record<
  AdminOrderTab,
  readonly OrderOriginValue[]
> = {
  all: ["direct_sale", "offer"],
  direct_sale: ["direct_sale"],
  offer_order: ["offer"],
};

/**
 * Sekme → alt sekmeler, ekrandaki sırayla. Her sekme "Tümü" ile başlar.
 * Siparişe dönmemiş tekliflerin "Bekleyen" / "Süresi Dolan" ayrımı artık
 * Teklifler sekmesinin durum filtresindedir (teklif satırı sipariş değildir).
 */
export const ADMIN_ORDER_TAB_BUCKETS: Record<
  AdminOrderTab,
  readonly AdminOrderBucket[]
> = {
  all: ADMIN_ORDER_BUCKETS,
  direct_sale: ADMIN_ORDER_BUCKETS,
  offer_order: ADMIN_ORDER_BUCKETS,
};

export const ADMIN_ORDER_BUCKET_I18N_KEYS = {
  all: "admin.operations.orders.buckets.all",
  new: "admin.operations.orders.buckets.new",
  shipped: "admin.operations.orders.buckets.shipped",
  in_transit: "admin.operations.orders.buckets.inTransit",
  delivered: "admin.operations.orders.buckets.delivered",
  cancelled: "admin.operations.orders.buckets.cancelled",
  refunds: "admin.operations.orders.buckets.refunds",
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

/** Kovayı belirleyen satır bilgisi: siparişin ve (varsa) kolinin durumu. */
export interface OrderLineState {
  status: OrderStatusValue;
  shipmentStatus: ShipmentStatusValue | null;
}

/** Satırda iade izi var mı (`ORDER_REFUND_LINE_RULE`). */
export function isRefundOrderLine(line: OrderLineState): boolean {
  const rule = ORDER_REFUND_LINE_RULE;
  return (
    (rule.orderStatuses as readonly OrderStatusValue[]).includes(line.status) ||
    (line.shipmentStatus !== null &&
      (rule.shipmentStatuses as readonly ShipmentStatusValue[]).includes(
        line.shipmentStatus,
      ))
  );
}

/**
 * Bir sepetin kovası — API'nin Prisma `where`'lerinin düz okuması (contract
 * spec ikisini her durum kombinasyonunda karşılaştırır). Satırsız sepet hiçbir
 * kovada değildir (`null`).
 *
 * 1. En geride kalan satırın aşaması (en geride paket kuralı).
 * 2. Hiçbir satır aşamada değilse: iade izi → İadeler; tamamı iptal →
 *    İptaller; kalan → Diğer.
 */
export function orderCartBucketOf(
  lines: readonly OrderLineState[],
): OrderCartBucket | null {
  if (lines.length === 0) return null;
  const stages = lines.map((line) =>
    orderLineStageOf(line.status, line.shipmentStatus),
  );
  for (const stage of ORDER_LINE_STAGES) {
    if (stages.includes(stage)) return stage;
  }
  if (lines.some(isRefundOrderLine)) return "refunds";
  const cancelled = ORDER_CANCELLED_LINE_STATUSES as readonly OrderStatusValue[];
  if (lines.every((line) => cancelled.includes(line.status))) {
    return "cancelled";
  }
  return "other";
}
