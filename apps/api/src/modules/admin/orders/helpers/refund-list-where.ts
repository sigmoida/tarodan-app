import {
  OrderOrigin,
  PaymentStatus,
  TradeStatus,
  type Prisma,
} from "@prisma/client";
import {
  ADMIN_REFUND_TAB_SOURCES,
  REFUND_ATTEMPT_IN_FLIGHT_STATUSES,
  REFUND_REQUEST_ARRIVED_STATUSES,
  REFUND_REQUEST_OPEN_STATUSES,
  REFUND_REQUEST_STATUS_BUCKETS,
  REFUND_RETURN_ARRIVED_SHIPMENT_STATUSES,
  SHIPMENT_STATUSES,
  TRADE_REFUND_AT_WAREHOUSE_STATUSES,
  TRADE_REFUND_CLOSED_STATUSES,
  TRADE_REFUND_DISPUTED_STATUSES,
  isRefundRequestKind,
  resolveAdminRefundBucket,
  resolveAdminRefundTab,
  type AdminRefundBucket,
  type AdminRefundFilterBucket,
  type AdminRefundTab,
  type RefundRequestKind,
  type RefundRequestStatusValue,
} from "@tarodan/types";
import { buildSearchWhere } from "../../../../common/list";
import { istanbulRangeEdge } from "../../../../common/helpers/tr-calendar";
import { refundRequestKindWhere } from "./refund-request-kind-where";

/**
 * Admin İadeler ekranının `where` builder'ı — TEK kaynak. Liste, sayaçlar ve
 * Excel aynı fonksiyonu çağırır; bir sekmenin ya da kovanın tanımı yalnız
 * burada değişir (sözlük ve kova kuralı: `@tarodan/types` `admin-refund-list.ts`).
 *
 * Kaynaklar:
 * - request: iade talepleri (`RefundRequest`) — direkt satış ve teklif.
 * - trade: iadesi olan takaslar. Takasın iade talebi yoktur; kapsam, tahsil
 *   edilmiş bir ödemesi olan ve iade yoluna girmiş (dönüşte / iptal / itiraz,
 *   ya da iade izi taşıyan) takastır. Her takas listede İKİ satırdır.
 */

/** Liste + sayaç + dışa aktarım uçlarının ortak filtreleri. */
export interface RefundListFilters {
  search?: string;
  /** İade tarihi aralığı (YYYY-MM-DD → İstanbul günü sınırları, ya da ISO an). */
  dateFrom?: string;
  dateTo?: string;
  kind?: RefundRequestKind;
}

/** Liste/sayaç isteğinin ham alanları — DTO'lar bunu karşılar. */
export interface RefundListQuery extends RefundListFilters {
  tab?: string;
  bucket?: string;
}

export interface RefundSourceWheres {
  request?: Prisma.RefundRequestWhereInput;
  trade?: Prisma.TradeWhereInput;
}

/**
 * Kova koşulunun sorguyla önceden okunan parçası: SÜREN iade denemesi olan
 * taleplerin id'leri. Deneme talebe FK ile değil idempotency anahtarıyla
 * (`refund-request:<id>`) bağlıdır; Prisma ilişkisi olmadığı için küme önce
 * okunur. Küme küçüktür (yalnız kesinleşmemiş denemeler).
 */
export interface RefundBucketContext {
  inFlightRequestIds: readonly string[];
}

/** Takasın tahsil edilmiş sayılan ödeme durumları. */
export const TRADE_REFUND_CHARGED_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.completed,
  PaymentStatus.refunded,
];

/** İade yoluna girmiş takas: depodan dönüşte, iptal edilmiş ya da itirazda. */
export const TRADE_REFUND_SCOPE_STATUSES: TradeStatus[] = [
  TradeStatus.returning,
  TradeStatus.cancelled,
  TradeStatus.disputed,
];

const MATCH_NOTHING = { id: { in: [] as string[] } };

/** Kovası iade denemesine bakan kovalar — önceden okunacak küme yalnız bunlarda gerekir. */
export function refundBucketNeedsAttempts(bucket: AdminRefundBucket): boolean {
  return (
    bucket === "refunding" ||
    bucket === "at_warehouse" ||
    bucket === "awaiting_return"
  );
}

// ── Kova koşulları ───────────────────────────────────────────────────────────

/**
 * İade talebi kovası → Prisma koşulu. `refundRequestBucketOf`'un birebir
 * çevirisi (contract spec her kombinasyonda karşılaştırır).
 *
 * Dikkat: SQL'de `NOT (return_status = 'delivered')` NULL satırı DIŞLAR; iade
 * kargosu olmayan talep "ulaşmadı" sayılsın diye null ayrıca yazılır.
 */
export function refundRequestBucketWhere(
  bucket: AdminRefundFilterBucket,
  ctx: RefundBucketContext,
): Prisma.RefundRequestWhereInput {
  const byStatus = (
    REFUND_REQUEST_STATUS_BUCKETS as Partial<
      Record<AdminRefundFilterBucket, readonly RefundRequestStatusValue[]>
    >
  )[bucket];
  if (byStatus) return { status: { in: [...byStatus] } };

  const open: Prisma.RefundRequestWhereInput = {
    status: { in: [...REFUND_REQUEST_OPEN_STATUSES] },
  };
  const inFlight: Prisma.RefundRequestWhereInput = {
    id: { in: [...ctx.inFlightRequestIds] },
  };
  const arrivedShipment = [...REFUND_RETURN_ARRIVED_SHIPMENT_STATUSES];
  const arrived: Prisma.RefundRequestWhereInput = {
    OR: [
      { status: { in: [...REFUND_REQUEST_ARRIVED_STATUSES] } },
      { returnStatus: { in: arrivedShipment } },
    ],
  };
  const notArrived: Prisma.RefundRequestWhereInput = {
    AND: [
      { status: { notIn: [...REFUND_REQUEST_ARRIVED_STATUSES] } },
      {
        OR: [
          { returnStatus: null },
          {
            returnStatus: {
              in: SHIPMENT_STATUSES.filter(
                (status) =>
                  !(arrivedShipment as readonly string[]).includes(status),
              ),
            },
          },
        ],
      },
    ],
  };
  const settledByReturn: Prisma.RefundRequestWhereInput[] = [
    open,
    { NOT: inFlight },
    refundRequestKindWhere("return"),
  ];

  switch (bucket) {
    case "refunding":
      return {
        AND: [open, { OR: [inFlight, refundRequestKindWhere("cancellation")] }],
      };
    case "at_warehouse":
      return { AND: [...settledByReturn, arrived] };
    case "awaiting_return":
      return { AND: [...settledByReturn, notArrived] };
    default:
      return MATCH_NOTHING;
  }
}

/**
 * Takas kovası → Prisma koşulu (`tradeRefundBucketOf`'un çevirisi). Takasın
 * inceleme / ret kovası yoktur.
 */
export function tradeRefundBucketWhere(
  bucket: AdminRefundFilterBucket,
): Prisma.TradeWhereInput {
  const inFlight = {
    status: { in: [...REFUND_ATTEMPT_IN_FLIGHT_STATUSES] },
  };
  const refundSignal: Prisma.TradeWhereInput = {
    OR: [
      { refundFailureReason: { not: null } },
      { refundAttempts: { some: inFlight } },
    ],
  };
  const noRefundSignal: Prisma.TradeWhereInput[] = [
    { refundFailureReason: null },
    { refundAttempts: { none: inFlight } },
  ];
  const disputed = [...TRADE_REFUND_DISPUTED_STATUSES];
  const atWarehouse = [...TRADE_REFUND_AT_WAREHOUSE_STATUSES];
  const closed = [...TRADE_REFUND_CLOSED_STATUSES];

  switch (bucket) {
    case "disputed":
      return { status: { in: disputed } };
    case "refunding":
      return { AND: [{ status: { notIn: disputed } }, refundSignal] };
    case "at_warehouse":
      return { AND: [{ status: { in: atWarehouse } }, ...noRefundSignal] };
    case "completed":
      return { AND: [{ status: { in: closed } }, ...noRefundSignal] };
    case "awaiting_return":
      return {
        AND: [
          { status: { notIn: [...disputed, ...atWarehouse, ...closed] } },
          ...noRefundSignal,
        ],
      };
    default:
      return MATCH_NOTHING;
  }
}

// ── Takas iadesinin türü ─────────────────────────────────────────────────────

/**
 * Takas iadesinin türü: ürün depoya ulaştıysa ya da depodan geri gönderildiyse
 * ürün iadesi (`return`), hiç ulaşmadan kapandıysa iptal iadesi.
 */
export function tradeRefundKindOf(trade: {
  firstWarehouseArrivalAt: Date | null;
  hasReturnLeg: boolean;
}): RefundRequestKind {
  return trade.firstWarehouseArrivalAt != null || trade.hasReturnLeg
    ? "return"
    : "cancellation";
}

/** `tradeRefundKindOf`'un Prisma karşılığı. */
export function tradeRefundKindWhere(
  kind: RefundRequestKind,
): Prisma.TradeWhereInput {
  return kind === "return"
    ? {
        OR: [
          { firstWarehouseArrivalAt: { not: null } },
          { shipments: { some: { leg: "return" } } },
        ],
      }
    : {
        AND: [
          { firstWarehouseArrivalAt: null },
          { shipments: { none: { leg: "return" } } },
        ],
      };
}

// ── Kapsam ve filtreler ──────────────────────────────────────────────────────

/** Sekmenin iade talebi kapsamı (sipariş kökeni); talep kaynağı yoksa undefined. */
function requestTabWhere(
  tab: AdminRefundTab,
): Prisma.RefundRequestWhereInput | undefined {
  const origins = ADMIN_REFUND_TAB_SOURCES[tab]
    .requestOrigins as readonly string[];
  if (origins.length === 0) return undefined;
  const direct = origins.includes("direct");
  const offer = origins.includes("offer");
  if (direct && offer) return {};
  return offer
    ? { order: { origin: OrderOrigin.offer } }
    : { order: { origin: { not: OrderOrigin.offer } } };
}

/** İadesi olan takas — liste, sayaç ve Excel'in takas kapsamı. */
export const TRADE_REFUND_SCOPE: Prisma.TradeWhereInput = {
  cashPayments: {
    some: { status: { in: TRADE_REFUND_CHARGED_PAYMENT_STATUSES } },
  },
  OR: [
    { status: { in: TRADE_REFUND_SCOPE_STATUSES } },
    { cashPayments: { some: { refundedAt: { not: null } } } },
    { refundFailureReason: { not: null } },
    { refundAttempts: { some: {} } },
  ],
};

const REQUEST_SEARCH_COLUMNS = [
  "refundNumber",
  "returnTrackingNumber",
  "returnProviderTrackingId",
  "description",
  "order.orderNumber",
  "order.checkoutGroup.groupNumber",
  "order.shipment.trackingNumber",
  "order.shipment.providerTrackingId",
  "order.product.title",
  "order.product.productCode",
  ...["buyer", "seller"].flatMap((side) =>
    ["displayName", "email", "adminCode"].map(
      (field) => `order.${side}.${field}`,
    ),
  ),
];

const TRADE_SEARCH_COLUMNS = [
  "tradeNumber",
  "cancelReason",
  ...["initiator", "receiver"].flatMap((side) =>
    ["displayName", "email", "adminCode"].map((field) => `${side}.${field}`),
  ),
];

function tradeSearchWhere(term: string): Prisma.TradeWhereInput | undefined {
  const own = buildSearchWhere(term, TRADE_SEARCH_COLUMNS);
  const leg = buildSearchWhere(term, ["trackingNumber", "providerTrackingId"]);
  const item = buildSearchWhere(term, ["product.title", "product.productCode"]);
  if (!own || !leg || !item) return undefined;
  return {
    OR: [
      ...(own.OR as Prisma.TradeWhereInput[]),
      { shipments: { some: leg as Prisma.TradeShipmentWhereInput } },
      { items: { some: item as Prisma.TradeItemWhereInput } },
    ],
  };
}

function dateRange(
  filters: RefundListFilters,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) {
    range.gte = istanbulRangeEdge(filters.dateFrom, "start");
  }
  if (filters.dateTo) range.lte = istanbulRangeEdge(filters.dateTo, "end");
  return range.gte || range.lte ? range : undefined;
}

function requestFilterParts(
  filters: RefundListFilters,
): Prisma.RefundRequestWhereInput[] {
  const parts: Prisma.RefundRequestWhereInput[] = [];
  const search = buildSearchWhere(filters.search, REQUEST_SEARCH_COLUMNS);
  if (search) parts.push(search as Prisma.RefundRequestWhereInput);
  const range = dateRange(filters);
  if (range) parts.push({ createdAt: range });
  if (filters.kind) parts.push(refundRequestKindWhere(filters.kind));
  return parts;
}

/**
 * Takasın iade tarihi `cancelledAt`'tir; dönüşte / itirazda olan (henüz
 * kapanmamış) takasın tarihi yoktur, tarih süzgecinde son hareketi
 * (`updatedAt`) okunur — sıralamadaki "açık takas" kuralıyla aynı.
 */
function tradeFilterParts(
  filters: RefundListFilters,
): Prisma.TradeWhereInput[] {
  const parts: Prisma.TradeWhereInput[] = [];
  const term = filters.search?.trim();
  if (term) parts.push(tradeSearchWhere(term) ?? MATCH_NOTHING);
  const range = dateRange(filters);
  if (range) {
    parts.push({
      OR: [{ cancelledAt: range }, { cancelledAt: null, updatedAt: range }],
    });
  }
  if (filters.kind) parts.push(tradeRefundKindWhere(filters.kind));
  return parts;
}

/**
 * Bir sekme × kovanın kaynakları ve her kaynağın `where`'i. Liste, sayaçlar ve
 * dışa aktarım bunu paylaşır.
 */
export function refundListSourceWheres(
  tab: AdminRefundTab,
  bucket: AdminRefundBucket,
  filters: RefundListFilters,
  ctx: RefundBucketContext,
): RefundSourceWheres {
  const result: RefundSourceWheres = {};

  const requestScope = requestTabWhere(tab);
  if (requestScope) {
    const parts = [requestScope, ...requestFilterParts(filters)];
    if (bucket !== "all") parts.push(refundRequestBucketWhere(bucket, ctx));
    result.request = { AND: parts };
  }

  if (ADMIN_REFUND_TAB_SOURCES[tab].trades) {
    const parts = [TRADE_REFUND_SCOPE, ...tradeFilterParts(filters)];
    if (bucket !== "all") parts.push(tradeRefundBucketWhere(bucket));
    result.trade = { AND: parts };
  }

  return result;
}

/** İstekten sekme, kova ve filtreleri çözer; tanınmayan değer varsayılana düşer. */
export function refundListScopeOf(query: RefundListQuery): {
  tab: AdminRefundTab;
  bucket: AdminRefundBucket;
  filters: RefundListFilters;
} {
  return {
    tab: resolveAdminRefundTab(query.tab),
    bucket: resolveAdminRefundBucket(query.bucket),
    filters: {
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      kind: isRefundRequestKind(query.kind) ? query.kind : undefined,
    },
  };
}

