import {
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  ProductKind,
  TradeStatus,
  type Prisma,
} from "@prisma/client";
import {
  ADMIN_CANCELLATION_BUCKET_ACTORS,
  ADMIN_CANCELLATION_NEW_WINDOW_MS,
  resolveAdminCancellationBucket,
  resolveAdminCancellationTab,
  type AdminCancellationBucket,
  type AdminCancellationTab,
} from "@tarodan/types";
import { buildSearchWhere, dateRangeWhere } from "../../../../common/list";

/**
 * İptaller sekmesinin `where` builder'ı — TEK kaynak. Liste, sayaçlar ve Excel
 * aynı fonksiyonu çağırır; bir sekmenin ya da alt sekmenin tanımı yalnız burada
 * değişir (sözlük: `@tarodan/types` `admin-cancellations.ts`).
 *
 * Kaynaklar:
 * - order: iptal edilmiş sipariş KALEMLERİ (satır = sepet/sipariş servis
 *   tarafında bu kalemlerden kurulur). Üyelik / öne çıkarma siparişleri
 *   operasyon satırı değildir → yalnız ilan ürünü.
 * - trade: iptal edilmiş ya da reddedilmiş takaslar.
 */

/** Liste + sayaç + dışa aktarım uçlarının ortak filtreleri. */
export interface CancellationListFilters {
  search?: string;
  orderNumber?: string;
  cargoCode?: string;
  groupNumber?: string;
  /** Alıcı veya satıcı: ad, e-posta, kullanıcı kodu ya da kullanıcı id'si. */
  party?: string;
  /** İptal anı aralığı (YYYY-MM-DD, dahil). */
  startDate?: string;
  endDate?: string;
}

export interface CancellationSourceWheres {
  order?: Prisma.OrderWhereInput;
  trade?: Prisma.TradeWhereInput;
}

/** Teklif sekmesi yalnız ÖDENMİŞ teklif siparişlerini listeler. */
export const PAID_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.completed,
  PaymentStatus.refunded,
];

export const CANCELLED_TRADE_STATUSES: TradeStatus[] = [
  TradeStatus.cancelled,
  TradeStatus.rejected,
];

const MATCH_NOTHING = { id: { in: [] as string[] } };

const ORDER_PARTY_COLUMNS = [
  ...["buyer", "seller"].flatMap((side) =>
    ["displayName", "email", "adminCode"].map((field) => `${side}.${field}`),
  ),
  "buyerId",
  "sellerId",
];

const TRADE_PARTY_COLUMNS = [
  ...["initiator", "receiver"].flatMap((side) =>
    ["displayName", "email", "adminCode"].map((field) => `${side}.${field}`),
  ),
  "initiatorId",
  "receiverId",
];

type FilterKey = "orderNumber" | "cargoCode" | "groupNumber" | "party";

const FILTER_KEYS: readonly FilterKey[] = [
  "orderNumber",
  "cargoCode",
  "groupNumber",
  "party",
];

/**
 * Her metin filtresinin kaynağa göre koşulu; eşleşecek kolon yoksa (takasın
 * grubu olmaz) `undefined` — "hiçbir satır eşleşmez" demektir.
 */
const ORDER_TEXT: Record<
  FilterKey,
  (term: string) => Record<string, unknown> | undefined
> = {
  orderNumber: (term) => buildSearchWhere(term, ["orderNumber"]),
  cargoCode: (term) =>
    buildSearchWhere(term, [
      "shipment.trackingNumber",
      "shipment.providerTrackingId",
    ]),
  groupNumber: (term) => buildSearchWhere(term, ["checkoutGroup.groupNumber"]),
  party: (term) => buildSearchWhere(term, ORDER_PARTY_COLUMNS),
};

const TRADE_TEXT: Record<
  FilterKey,
  (term: string) => Record<string, unknown> | undefined
> = {
  orderNumber: (term) => buildSearchWhere(term, ["tradeNumber"]),
  // Takasın kargoları çoklu ilişki: herhangi bir bacağın kodu.
  cargoCode: (term) => {
    const leg = buildSearchWhere(term, [
      "trackingNumber",
      "providerTrackingId",
    ]);
    return leg ? { shipments: { some: leg } } : undefined;
  },
  groupNumber: () => undefined,
  party: (term) => buildSearchWhere(term, TRADE_PARTY_COLUMNS),
};

function textParts(
  filters: CancellationListFilters,
  columns: typeof ORDER_TEXT,
): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const search = filters.search?.trim();
  if (search) {
    const any = FILTER_KEYS.map((key) => columns[key](search)).filter(
      (where): where is Record<string, unknown> => !!where,
    );
    parts.push(any.length ? { OR: any } : MATCH_NOTHING);
  }
  for (const key of FILTER_KEYS) {
    const term = filters[key]?.trim();
    if (!term) continue;
    parts.push(columns[key](term) ?? MATCH_NOTHING);
  }
  const dates = dateRangeWhere(filters, "cancelledAt");
  if (Object.keys(dates).length > 0) parts.push(dates);
  return parts;
}

/**
 * Alt sekmenin koşulu (iki kaynakta da aynı kolon adları: `cancelledAt`,
 * `cancelledBy`). "Tümü" koşul eklemez; aktörü bilinmeyen satır aktör
 * sekmelerine hiç girmez (`in` null'u eşlemez).
 */
export function cancellationBucketWhere(
  bucket: AdminCancellationBucket,
  now: Date,
): Record<string, unknown> | undefined {
  if (bucket === "all") return undefined;
  if (bucket === "new") {
    return {
      cancelledAt: {
        gte: new Date(now.getTime() - ADMIN_CANCELLATION_NEW_WINDOW_MS),
      },
    };
  }
  return { cancelledBy: { in: [...ADMIN_CANCELLATION_BUCKET_ACTORS[bucket]] } };
}

/** Sekmenin sipariş kapsamı; takas sekmesinde sipariş kaynağı yok. */
function orderTabWhere(
  tab: AdminCancellationTab,
): Prisma.OrderWhereInput | undefined {
  const base: Prisma.OrderWhereInput = {
    status: OrderStatus.cancelled,
    product: { kind: ProductKind.listing },
  };
  const directSale: Prisma.OrderWhereInput = {
    origin: OrderOrigin.direct_sale,
  };
  // Ödenmemiş (vazgeçilmiş) teklif listelenmez: teklif siparişinin ödemesi
  // doğrudan siparişe bağlıdır (teklif siparişi sepete girmez).
  const paidOffer: Prisma.OrderWhereInput = {
    origin: OrderOrigin.offer,
    payment: { is: { status: { in: PAID_PAYMENT_STATUSES } } },
  };
  switch (tab) {
    case "direct_sale":
      return { AND: [base, directSale] };
    case "offer":
      return { AND: [base, paidOffer] };
    case "all":
      return { AND: [base, { OR: [directSale, paidOffer] }] };
    default:
      return undefined;
  }
}

function tradeTabWhere(
  tab: AdminCancellationTab,
): Prisma.TradeWhereInput | undefined {
  if (tab !== "all" && tab !== "trade") return undefined;
  return { status: { in: CANCELLED_TRADE_STATUSES } };
}

/**
 * Bir sekme × alt sekmenin kaynakları ve her kaynağın `where`'i. Liste,
 * sayaçlar ve dışa aktarım bunu paylaşır.
 */
export function cancellationSourceWheres(
  tab: AdminCancellationTab,
  bucket: AdminCancellationBucket,
  filters: CancellationListFilters,
  now: Date,
): CancellationSourceWheres {
  const bucketWhere = cancellationBucketWhere(bucket, now);
  const result: CancellationSourceWheres = {};

  const orderScope = orderTabWhere(tab);
  if (orderScope) {
    const parts: Prisma.OrderWhereInput[] = [
      orderScope,
      ...(textParts(filters, ORDER_TEXT) as Prisma.OrderWhereInput[]),
    ];
    if (bucketWhere) parts.push(bucketWhere as Prisma.OrderWhereInput);
    result.order = { AND: parts };
  }

  const tradeScope = tradeTabWhere(tab);
  if (tradeScope) {
    const parts: Prisma.TradeWhereInput[] = [
      tradeScope,
      ...(textParts(filters, TRADE_TEXT) as Prisma.TradeWhereInput[]),
    ];
    if (bucketWhere) parts.push(bucketWhere as Prisma.TradeWhereInput);
    result.trade = { AND: parts };
  }

  return result;
}

/** Liste/sayaç isteğinin ham alanları — DTO'lar bunu karşılar. */
export interface CancellationListQuery extends CancellationListFilters {
  tab?: string;
  bucket?: string;
}

/** İstekten sekme, alt sekme ve filtreleri çözer; tanınmayan değer varsayılana düşer. */
export function cancellationScopeOf(query: CancellationListQuery): {
  tab: AdminCancellationTab;
  bucket: AdminCancellationBucket;
  filters: CancellationListFilters;
} {
  return {
    tab: resolveAdminCancellationTab(query.tab),
    bucket: resolveAdminCancellationBucket(query.bucket),
    filters: {
      search: query.search,
      orderNumber: query.orderNumber,
      cargoCode: query.cargoCode,
      groupNumber: query.groupNumber,
      party: query.party,
      startDate: query.startDate,
      endDate: query.endDate,
    },
  };
}
