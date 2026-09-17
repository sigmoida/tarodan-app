import { OrderOrigin, ProductKind, type Prisma } from "@prisma/client";
import type { AdminOrderBucket, AdminOrderTab } from "@tarodan/types";
import { buildSearchWhere, dateRangeWhere } from "../../../../common/list";
import {
  cartBucketWhere,
  groupLines,
  offerBucketWhere,
  singleLine,
  type CartBucket,
} from "./order-bucket-where";

/** Liste + sayaç uçlarının ortak filtre alanları (DTO'nun alt kümesi). */
export interface OrderListFilters {
  search?: string;
  party?: string;
  orderNumber?: string;
  packageNumber?: string;
  groupNumber?: string;
  productQuery?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: "buyer" | "seller";
  productId?: string;
}

/**
 * Her metin filtresinin hangi kolonlarda arandığı. Sipariş ve teklif AYNI
 * buyer/seller/product ilişkilerini taşır; yalnız sipariş kodlarına teklif
 * kendi `order` ilişkisi üzerinden ulaşır. Teklifin grubu olmaz → boş liste
 * "hiçbir teklif eşleşmez" demektir (filtre yok değil).
 */
interface TextFilterColumns {
  party: readonly string[];
  productQuery: readonly string[];
  orderNumber: readonly string[];
  packageNumber: readonly string[];
  groupNumber: readonly string[];
}

const PARTY_COLUMNS = ["buyer", "seller"].flatMap((side) =>
  ["displayName", "email", "adminCode"].map((field) => `${side}.${field}`),
);
const PRODUCT_COLUMNS = [
  "product.title",
  "product.modelCode",
  "product.productCode",
];

const ORDER_COLUMNS: TextFilterColumns = {
  party: PARTY_COLUMNS,
  productQuery: PRODUCT_COLUMNS,
  orderNumber: ["orderNumber"],
  packageNumber: ["package.packageNumber"],
  groupNumber: ["checkoutGroup.groupNumber"],
};

const OFFER_COLUMNS: TextFilterColumns = {
  party: PARTY_COLUMNS,
  productQuery: PRODUCT_COLUMNS,
  orderNumber: ["order.orderNumber"],
  packageNumber: ["order.package.packageNumber"],
  groupNumber: [],
};

const TEXT_FILTERS = [
  "party",
  "orderNumber",
  "packageNumber",
  "groupNumber",
  "productQuery",
] as const;

const MATCH_NOTHING = { id: { in: [] as string[] } };

function textFilterWhere(
  term: string | undefined,
  columns: readonly string[],
): Record<string, unknown> | undefined {
  if (!term?.trim()) return undefined;
  return buildSearchWhere(term, columns) ?? MATCH_NOTHING;
}

/** Deep-link kapsamı (kullanıcı / ürün detayından gelen). */
function scopeParts(filters: OrderListFilters): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const { userId, userRole, productId } = filters;
  if (userId) {
    if (userRole === "buyer") parts.push({ buyerId: userId });
    else if (userRole === "seller") parts.push({ sellerId: userId });
    else parts.push({ OR: [{ buyerId: userId }, { sellerId: userId }] });
  }
  if (productId) parts.push({ productId });
  return parts;
}

function filterParts(
  filters: OrderListFilters,
  columns: TextFilterColumns,
): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const everyColumn = TEXT_FILTERS.flatMap((key) => columns[key]);
  const search = textFilterWhere(filters.search, everyColumn);
  if (search) parts.push(search);
  for (const key of TEXT_FILTERS) {
    const where = textFilterWhere(filters[key], columns[key]);
    if (where) parts.push(where);
  }
  const dates = dateRangeWhere(filters);
  if (Object.keys(dates).length > 0) parts.push(dates);
  parts.push(...scopeParts(filters));
  return parts;
}

function andOf<TWhere>(parts: Record<string, unknown>[]): TWhere {
  return (parts.length > 0 ? { AND: parts } : {}) as TWhere;
}

/** Bir sipariş satırının liste filtrelerine uyma koşulu. */
export function orderLineFilterWhere(
  filters: OrderListFilters,
): Prisma.OrderWhereInput {
  return andOf(filterParts(filters, ORDER_COLUMNS));
}

/**
 * Grup satırında hangi kalemlerin GÖSTERİLECEĞİ: yalnız deep-link kapsamı.
 * Kullanıcı görünümünde başka satıcının kalemleri, ürün görünümünde sepetin
 * ilgisiz kalemleri satıra dökülmez.
 */
export function orderLineScopeWhere(
  filters: OrderListFilters,
): Prisma.OrderWhereInput {
  return andOf(scopeParts(filters));
}

export function offerFilterWhere(
  filters: OrderListFilters,
): Prisma.OfferWhereInput {
  return andOf(filterParts(filters, OFFER_COLUMNS));
}

/**
 * Bir sekmenin satır kaynakları ve her kaynağın `where`'i.
 * - all / direct_sale: CheckoutGroup (sepet) + grupsuz tekil sipariş. Grupsuz
 *   kaynak ürün türüyle sınırlıdır: üyelik ve öne çıkarma siparişleri de grupsuz
 *   oluşur ama operasyon satırı değildir.
 * - offer: teklifin kendisi (sipariş olmuşsa siparişiyle birlikte).
 * Liste ve sayaçlar bu fonksiyonu paylaşır.
 */
export function orderListSourceWheres(
  tab: AdminOrderTab,
  bucket: AdminOrderBucket | undefined,
  filters: OrderListFilters,
  now: Date,
): {
  group?: Prisma.CheckoutGroupWhereInput;
  loose?: Prisma.OrderWhereInput;
  offer?: Prisma.OfferWhereInput;
} {
  if (tab === "offer") {
    const parts: Prisma.OfferWhereInput[] = [offerFilterWhere(filters)];
    if (bucket) parts.push(offerBucketWhere(bucket, now));
    return { offer: { AND: parts } };
  }

  const cartBucket = bucket as CartBucket | undefined;
  const lineFilter = orderLineFilterWhere(filters);
  const hasFilter = Object.keys(lineFilter).length > 0;

  const group: Prisma.CheckoutGroupWhereInput[] = [];
  if (hasFilter) group.push(groupLines(lineFilter));
  if (cartBucket) group.push(cartBucketWhere(cartBucket, groupLines));

  const origins: OrderOrigin[] =
    tab === "direct_sale"
      ? [OrderOrigin.direct_sale]
      : [OrderOrigin.direct_sale, OrderOrigin.offer];
  const loose: Prisma.OrderWhereInput[] = [
    {
      checkoutGroupId: null,
      product: { kind: ProductKind.listing },
      origin: { in: origins },
    },
  ];
  if (hasFilter) loose.push(lineFilter);
  if (cartBucket) loose.push(cartBucketWhere(cartBucket, singleLine));

  return { group: { AND: group }, loose: { AND: loose } };
}
