import {
  OrderOrigin,
  OrderStatus,
  ProductKind,
  type Prisma,
} from "@prisma/client";
import {
  ADMIN_ORDER_TAB_ORIGINS,
  adminOrderBucketFilter,
  resolveAdminOrderBucket,
  resolveAdminOrderTab,
  type AdminOrderBucket,
  type AdminOrderTab,
} from "@tarodan/types";
import { buildSearchWhere, dateRangeWhere } from "../../../../common/list";
import { cartBucketWhere, groupLines, singleLine } from "./order-bucket-where";

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
  /** Eski deep-link'ler (`?status=delivered`): tek sipariş durumu. */
  status?: OrderStatus;
}

const PARTY_COLUMNS = ["buyer", "seller"].flatMap((side) =>
  ["displayName", "email", "adminCode"].map((field) => `${side}.${field}`),
);

/**
 * Her metin filtresinin bir sipariş satırında hangi kolonlarda arandığı. Bir
 * kod yalnız kendi kolonunda aranır (paket numarası kullanıcı kodu değildir);
 * serbest arama hepsini birden tarar.
 */
const TEXT_FILTER_COLUMNS = {
  party: PARTY_COLUMNS,
  orderNumber: ["orderNumber"],
  packageNumber: ["package.packageNumber"],
  groupNumber: ["checkoutGroup.groupNumber"],
  productQuery: ["product.title", "product.modelCode", "product.productCode"],
} as const satisfies Record<string, readonly string[]>;

const TEXT_FILTERS = Object.keys(TEXT_FILTER_COLUMNS) as Array<
  keyof typeof TEXT_FILTER_COLUMNS
>;

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

function filterParts(filters: OrderListFilters): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const everyColumn = TEXT_FILTERS.flatMap((key) => TEXT_FILTER_COLUMNS[key]);
  const search = textFilterWhere(filters.search, everyColumn);
  if (search) parts.push(search);
  for (const key of TEXT_FILTERS) {
    const where = textFilterWhere(filters[key], TEXT_FILTER_COLUMNS[key]);
    if (where) parts.push(where);
  }
  if (filters.status) parts.push({ status: filters.status });
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
  return andOf(filterParts(filters));
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

/**
 * Bir sekmenin satır kaynakları ve her kaynağın `where`'i — liste ve sayaçlar
 * bu fonksiyonu paylaşır.
 * - group: CheckoutGroup (sepet). Yalnız doğrudan satış gruplanır; teklif
 *   siparişi hiç gruba girmez, bu yüzden "Siparişe Dönen Teklifler"de yoktur.
 * - loose: grupsuz tekil sipariş, sekmenin kökenleriyle (`ADMIN_ORDER_TAB_ORIGINS`)
 *   ve ürün türüyle sınırlı: üyelik ve öne çıkarma siparişleri de grupsuz
 *   oluşur ama operasyon satırı değildir.
 * "Tümü" (ya da kova yok) kova koşulu eklemez: sekmenin kapsamı + filtreler.
 */
export function orderListSourceWheres(
  tab: AdminOrderTab,
  bucket: AdminOrderBucket | undefined,
  filters: OrderListFilters,
): {
  group?: Prisma.CheckoutGroupWhereInput;
  loose: Prisma.OrderWhereInput;
} {
  const cartBucket = adminOrderBucketFilter(bucket);
  const lineFilter = orderLineFilterWhere(filters);
  const hasFilter = Object.keys(lineFilter).length > 0;
  const origins = ADMIN_ORDER_TAB_ORIGINS[tab] as readonly OrderOrigin[];

  const loose: Prisma.OrderWhereInput[] = [
    {
      checkoutGroupId: null,
      product: { kind: ProductKind.listing },
      origin: { in: [...origins] },
    },
  ];
  if (hasFilter) loose.push(lineFilter);
  if (cartBucket) loose.push(cartBucketWhere(cartBucket, singleLine));

  if (!origins.includes(OrderOrigin.direct_sale)) {
    return { loose: { AND: loose } };
  }

  const group: Prisma.CheckoutGroupWhereInput[] = [];
  if (hasFilter) group.push(groupLines(lineFilter));
  if (cartBucket) group.push(cartBucketWhere(cartBucket, groupLines));
  return { group: { AND: group }, loose: { AND: loose } };
}

/** Liste/sayaç isteğinin ham alanları — DTO'lar bunu karşılar. */
export interface OrderListQuery extends OrderListFilters {
  tab?: string;
  bucket?: string;
  /** Eski istemci: `origin` sekmeyi seçerdi. */
  origin?: OrderOrigin;
  /** Eski istemci: tarih aralığının eski adları. */
  fromDate?: string;
  toDate?: string;
}

/**
 * İstekten sekme, kova ve filtreleri çözer. Eski parametreler yeni karşılığına
 * çevrilir (`origin` → sekme, `fromDate`/`toDate` → `startDate`/`endDate`).
 * Kova hiç verilmemişse ya da sekmede yoksa "Tümü"ne düşer: sekmenin bütün
 * satırları (kullanıcı/ürün deep-link'i, eski istemci).
 */
export function orderListScopeOf(query: OrderListQuery): {
  tab: AdminOrderTab;
  bucket: AdminOrderBucket;
  filters: OrderListFilters;
} {
  const tab = resolveAdminOrderTab(query.tab ?? originTab(query.origin));
  const bucket = resolveAdminOrderBucket(tab, query.bucket);
  const filters: OrderListFilters = {
    search: query.search,
    party: query.party,
    orderNumber: query.orderNumber,
    packageNumber: query.packageNumber,
    groupNumber: query.groupNumber,
    productQuery: query.productQuery,
    startDate: query.startDate ?? query.fromDate,
    endDate: query.endDate ?? query.toDate,
    userId: query.userId,
    userRole: query.userRole,
    productId: query.productId,
    status: query.status,
  };
  return { tab, bucket, filters };
}

function originTab(origin: OrderOrigin | undefined): AdminOrderTab | undefined {
  if (origin === OrderOrigin.offer) return "offer_order";
  if (origin === OrderOrigin.direct_sale) return "direct_sale";
  return undefined;
}
