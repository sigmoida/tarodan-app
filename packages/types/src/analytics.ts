/**
 * Admin **Analytics** screen — the contract shared by the API endpoints, their
 * DTOs, the admin screen and the exports.
 *
 * The dashboard answers "what needs me now, and where do we stand". Analytics
 * answers a different question: **what happened over a window of time, and
 * why**. So everything here is a FLOW measured between two instants; single
 * balances (escrow, active listings, memberships by tier) stay on the
 * dashboard and are deliberately absent.
 *
 * Every figure is measured from the EVENT stamp that created it
 * (`Payment.paidAt`, `Order.deliveredAt`, `Order.cancelledAt`,
 * `CommissionLedger.earnedAt`, `RefundRequest.refundedAt`,
 * `Trade.completedAt`, `Product.publishedAt`, `ProductBoost.purchasedAt`,
 * `MembershipPayment.createdAt`) rather than from `status + createdAt`. An
 * order placed in March and paid in April belongs to April.
 */

// ===========================================================================
// Range, grouping, comparison — the controls every tab shares
// ===========================================================================

export const ANALYTICS_TABS = [
  "sales",
  "trade",
  "catalog",
  "quality",
  "membership",
] as const;

export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const DEFAULT_ANALYTICS_TAB: AnalyticsTab = "sales";

export function isAnalyticsTab(value: unknown): value is AnalyticsTab {
  return (
    typeof value === "string" &&
    (ANALYTICS_TABS as readonly string[]).includes(value)
  );
}

export const ANALYTICS_GROUP_BYS = ["day", "week", "month"] as const;

export type AnalyticsGroupBy = (typeof ANALYTICS_GROUP_BYS)[number];

export const DEFAULT_ANALYTICS_GROUP_BY: AnalyticsGroupBy = "day";

export function isAnalyticsGroupBy(value: unknown): value is AnalyticsGroupBy {
  return (
    typeof value === "string" &&
    (ANALYTICS_GROUP_BYS as readonly string[]).includes(value)
  );
}

/** The screen opens on the last month. */
export const ANALYTICS_DEFAULT_RANGE_DAYS = 30;

/**
 * A hard ceiling on the window, enforced by the DTO. Every tab aggregates in
 * SQL, but an unbounded range still scans the whole table and fills a chart
 * with thousands of buckets nobody reads. A year plus a day covers
 * "this year vs last year" inclusively.
 */
export const ANALYTICS_MAX_RANGE_DAYS = 366;

/** Query accepted by every `GET /admin/analytics/*` endpoint. */
export interface AnalyticsRangeQuery {
  /** ISO date (`YYYY-MM-DD`), inclusive start. */
  from?: string;
  /** ISO date (`YYYY-MM-DD`), inclusive end. */
  to?: string;
  groupBy?: AnalyticsGroupBy;
  /** Also measure the preceding window of equal length. */
  compare?: boolean;
}

/** Why a range is unusable — the caller maps it to its own copy. */
export type AnalyticsRangeIssue =
  | "incomplete"
  | "unparseable"
  | "reversed"
  | "tooLong";

/**
 * The ONE rule for an analytics range: either both ends are absent (the
 * default window applies) or both are present, parseable, ordered and no
 * longer than {@link ANALYTICS_MAX_RANGE_DAYS}.
 *
 * The API DTO, the range resolver and the admin filter all validate against
 * this function instead of each re-deciding what a valid range is.
 */
export function analyticsRangeIssue(
  query: AnalyticsRangeQuery | undefined,
): AnalyticsRangeIssue | null {
  const from = query?.from;
  const to = query?.to;

  if (!from && !to) return null;
  if (!from || !to) return "incomplete";

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return "unparseable";
  if (fromTime > toTime) return "reversed";

  const days = Math.floor((toTime - fromTime) / 86_400_000) + 1;
  if (days > ANALYTICS_MAX_RANGE_DAYS) return "tooLong";

  return null;
}

/** The window the API actually measured, echoed back so the UI never guesses. */
export interface AnalyticsRange {
  /** ISO timestamp, inclusive. */
  from: string;
  /** ISO timestamp, inclusive. */
  to: string;
  groupBy: AnalyticsGroupBy;
  /** Whether `previous`/`changePercent` carry a real measurement. */
  compared: boolean;
  /** The preceding window of equal length — present only when compared. */
  previousFrom: string | null;
  previousTo: string | null;
  /**
   * The IANA zone the day/week/month buckets were cut in. Bucketing and the
   * range bounds use the same zone — mixing local bounds with UTC day keys is
   * exactly how a day used to land in the wrong bucket.
   */
  timeZone: string;
}

// ===========================================================================
// The three shapes every tab is built from
// ===========================================================================

/**
 * One number for the selected window, optionally against the preceding one.
 * `previous`/`changePercent` are null when the caller did not ask to compare —
 * an un-measured comparison is absent, never zero.
 */
export interface AnalyticsMetric {
  current: number;
  previous: number | null;
  changePercent: number | null;
}

/** One bucket of a time series. `bucket` is `YYYY-MM-DD` at the bucket start. */
export interface AnalyticsPoint {
  bucket: string;
  value: number;
}

/**
 * A series always covers EVERY bucket in the range, zeros included. A day with
 * no rows is information ("nothing sold"), not a day to skip: skipping it drew
 * a straight line between two distant dates and flattered the trend.
 */
export interface AnalyticsSeries<K extends string = string> {
  key: K;
  points: AnalyticsPoint[];
}

/** A row of a category/brand/reason/tier breakdown. */
export interface AnalyticsBreakdownRow {
  /** Stable identifier (id, enum value, or price-band key). */
  key: string;
  /** Human label resolved server-side where it is a DB name, else the key. */
  label: string;
  count: number;
  amount: number;
  /** `amount` (or `count` for count-only breakdowns) as a share of the total. */
  share: number;
}

/** A leaderboard row — sellers and products ranked by REAL sales. */
export interface AnalyticsLeaderRow {
  id: string;
  label: string;
  orderCount: number;
  gmv: number;
}

/** One step of a funnel, with the drop-off from the step before it. */
export interface AnalyticsFunnelStep {
  key: string;
  count: number;
  /** Share of the FIRST step, in percent. */
  conversionFromFirst: number;
  /** Share of the PREVIOUS step lost at this step, in percent. */
  dropOffFromPrevious: number;
}

/**
 * Price bands, defined once and shared by the SQL that buckets orders and the
 * UI that labels them. `max` is exclusive; the last band is open-ended.
 */
export const ANALYTICS_PRICE_BANDS = [
  { key: "0-250", min: 0, max: 250 },
  { key: "250-500", min: 250, max: 500 },
  { key: "500-1000", min: 500, max: 1000 },
  { key: "1000-2500", min: 1000, max: 2500 },
  { key: "2500-5000", min: 2500, max: 5000 },
  { key: "5000+", min: 5000, max: null },
] as const;

export type AnalyticsPriceBandKey =
  (typeof ANALYTICS_PRICE_BANDS)[number]["key"];

// ===========================================================================
// Satış ve Gelir
// ===========================================================================

export const SALES_METRIC_KEYS = [
  /** Paid order value, `Order.origin != platform_service`. */
  "gmv",
  "orderCount",
  "averageBasket",
  /** `CommissionLedger` net — the SAME formula the finance summary uses. */
  "netRevenue",
  /** What coupons cost, split by who funded them. */
  "discountCost",
  "platformFundedDiscount",
  "feeDiscountCost",
  /** Shipping charged to the buyer vs what the carrier actually billed. */
  "collectedShipping",
  "carrierCost",
  /** Money actually sent back, partial refunds included. */
  "refundedAmount",
] as const;

export type SalesMetricKey = (typeof SALES_METRIC_KEYS)[number];

export const SALES_SERIES_KEYS = [
  "gmv",
  "orderCount",
  "netRevenue",
  "refundedAmount",
] as const;

export type SalesSeriesKey = (typeof SALES_SERIES_KEYS)[number];

export interface AnalyticsSalesResponse {
  range: AnalyticsRange;
  metrics: Record<SalesMetricKey, AnalyticsMetric>;
  series: AnalyticsSeries<SalesSeriesKey>[];
  byCategory: AnalyticsBreakdownRow[];
  byBrand: AnalyticsBreakdownRow[];
  byPriceBand: AnalyticsBreakdownRow[];
  topSellers: AnalyticsLeaderRow[];
  topProducts: AnalyticsLeaderRow[];
}

// ===========================================================================
// Takas ve Teklif
// ===========================================================================

export const TRADE_METRIC_KEYS = [
  "averageTradeValue",
  /** v2 fixed service fee + v1 percentage commission with its VAT, gross. */
  "tradeFeeRevenue",
  "offersCreated",
  "offersResponded",
  "offersAccepted",
  "offerOrders",
  /** Answered offers ÷ offers that reached a terminal state, in percent. */
  "offerResponseRate",
  /** Orders born of an offer ÷ accepted offers, in percent. */
  "offerConversionRate",
] as const;

export type TradeMetricKey = (typeof TRADE_METRIC_KEYS)[number];

export const TRADE_SERIES_KEYS = [
  "tradesCreated",
  "tradesCompleted",
  "tradeFeeRevenue",
] as const;

export type TradeSeriesKey = (typeof TRADE_SERIES_KEYS)[number];

/**
 * The trade funnel. `rejected` and `cancelled` are exits, not steps, so they
 * are reported beside the funnel rather than inside it.
 */
export const TRADE_FUNNEL_STEPS = ["created", "accepted", "completed"] as const;

export interface AnalyticsTradeResponse {
  range: AnalyticsRange;
  metrics: Record<TradeMetricKey, AnalyticsMetric>;
  series: AnalyticsSeries<TradeSeriesKey>[];
  funnel: AnalyticsFunnelStep[];
  /** Trades that left the funnel, by exit. */
  exits: AnalyticsBreakdownRow[];
  /** v1 vs v2 pricing — the two charge trades in different ways. */
  byPricingVersion: AnalyticsBreakdownRow[];
  offerFunnel: AnalyticsFunnelStep[];
}

// ===========================================================================
// Katalog ve Satıcı
// ===========================================================================

export const CATALOG_METRIC_KEYS = [
  "listingsCreated",
  "listingsPublished",
  "listingsSold",
  /** Asking price of what was PUBLISHED in the window — no status filter. */
  "averagePrice",
  "medianTimeToSellDays",
  "medianSellerTimeToFirstSaleDays",
  "boostRevenue",
  "boostCount",
  /** `finalViewCount − baselineViewCount`, averaged over finished boosts. */
  "averageBoostViewUplift",
] as const;

export type CatalogMetricKey = (typeof CATALOG_METRIC_KEYS)[number];

export const CATALOG_SERIES_KEYS = [
  "listingsPublished",
  "listingsSold",
  "boostRevenue",
] as const;

export type CatalogSeriesKey = (typeof CATALOG_SERIES_KEYS)[number];

export const CATALOG_FUNNEL_STEPS = ["created", "published", "sold"] as const;

export interface AnalyticsCatalogResponse {
  range: AnalyticsRange;
  metrics: Record<CatalogMetricKey, AnalyticsMetric>;
  series: AnalyticsSeries<CatalogSeriesKey>[];
  funnel: AnalyticsFunnelStep[];
  byCategory: AnalyticsBreakdownRow[];
  byPriceBand: AnalyticsBreakdownRow[];
  byCondition: AnalyticsBreakdownRow[];
  /** Boost packages: purchases, revenue and the view uplift they produced. */
  boostPackages: AnalyticsBoostPackageRow[];
}

export interface AnalyticsBoostPackageRow {
  key: string;
  label: string;
  count: number;
  amount: number;
  share: number;
  /** Null until at least one boost in the window has finished measuring. */
  averageViewUplift: number | null;
}

// ===========================================================================
// Kalite ve Operasyon
// ===========================================================================

export const QUALITY_METRIC_KEYS = [
  "paidOrders",
  "refundedOrders",
  /** Refunded ÷ paid in the same window, in percent. */
  "refundRate",
  "refundedAmount",
  "cancelledOrders",
  "cancellationRate",
  "paymentAttempts",
  "failedPayments",
  "paymentFailureRate",
  /** Median, in hours — an average is wrecked by one stuck order. */
  "medianPaidToShippedHours",
  "medianShippedToDeliveredHours",
  "medianPaidToDeliveredHours",
] as const;

export type QualityMetricKey = (typeof QUALITY_METRIC_KEYS)[number];

export const QUALITY_SERIES_KEYS = [
  "refundedOrders",
  "cancelledOrders",
  "failedPayments",
] as const;

export type QualitySeriesKey = (typeof QUALITY_SERIES_KEYS)[number];

export interface AnalyticsQualityResponse {
  range: AnalyticsRange;
  metrics: Record<QualityMetricKey, AnalyticsMetric>;
  series: AnalyticsSeries<QualitySeriesKey>[];
  /** `RefundRequest.resolvedReason` — what the case turned out to be. */
  refundsByReason: AnalyticsBreakdownRow[];
  refundsByFault: AnalyticsBreakdownRow[];
  /** `RefundFinancialComponent` — which part of the money moved. */
  refundComponents: AnalyticsBreakdownRow[];
  cancellationsByReason: AnalyticsBreakdownRow[];
  cancellationsByType: AnalyticsBreakdownRow[];
  installmentMix: AnalyticsBreakdownRow[];
  /**
   * `Order.cancelledAt` only exists from the dashboard migration onwards, so
   * cancellations recorded before it are invisible here. The screen says so
   * rather than letting the number read as a real decline.
   */
  cancellationsTruncatedBefore: string | null;
}

// ===========================================================================
// Üyelik
// ===========================================================================

export const MEMBERSHIP_METRIC_KEYS = [
  /** First payment of a subscription — `MembershipPayment.orderId` is set. */
  "newMemberships",
  /** `MembershipPayment.orderId IS NULL` — the recurring charge. */
  "renewals",
  "churned",
  "pastDue",
  "membershipRevenue",
] as const;

export type MembershipMetricKey = (typeof MEMBERSHIP_METRIC_KEYS)[number];

export const MEMBERSHIP_SERIES_KEYS = [
  "newMemberships",
  "renewals",
  "membershipRevenue",
] as const;

export type MembershipSeriesKey = (typeof MEMBERSHIP_SERIES_KEYS)[number];

export interface AnalyticsMembershipResponse {
  range: AnalyticsRange;
  metrics: Record<MembershipMetricKey, AnalyticsMetric>;
  series: AnalyticsSeries<MembershipSeriesKey>[];
  byTier: AnalyticsBreakdownRow[];
}

// ===========================================================================
// Exports
// ===========================================================================

export const ANALYTICS_EXPORT_FORMATS = ["csv", "xlsx"] as const;

export type AnalyticsExportFormat = (typeof ANALYTICS_EXPORT_FORMATS)[number];

export function isAnalyticsExportFormat(
  value: unknown,
): value is AnalyticsExportFormat {
  return (
    typeof value === "string" &&
    (ANALYTICS_EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

/** The tab's response, keyed by tab — one definition for screen and export. */
export interface AnalyticsTabResponse {
  sales: AnalyticsSalesResponse;
  trade: AnalyticsTradeResponse;
  catalog: AnalyticsCatalogResponse;
  quality: AnalyticsQualityResponse;
  membership: AnalyticsMembershipResponse;
}
