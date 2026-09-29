import { ADMIN_REFUNDS_VIEW_HREF } from "./admin-cancellations";
import {
  ADMIN_ORDERS_PATH,
  ADMIN_TRADES_TAB_HREF,
} from "./admin-orders-screen";

/**
 * Admin dashboard period filter — the contract shared by the API endpoint
 * (`GET /admin/dashboard`), its DTO and the admin dashboard screen.
 *
 * One period selection drives every stat card, but it only ever changes ONE
 * number on the card: the headline (`DashboardMetric.period`). Three more
 * figures — dün, bu ay, tüm zamanlar — are always returned alongside it, and
 * they never move with the filter, so the card can show all four without a
 * second request.
 */

export const DASHBOARD_PERIODS = ["daily", "monthly", "custom"] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** The dashboard opens on today's figures. */
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = "daily";

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return (
    typeof value === "string" &&
    (DASHBOARD_PERIODS as readonly string[]).includes(value)
  );
}

/** Query accepted by `GET /admin/dashboard`. `from`/`to` are `custom`-only. */
export interface DashboardPeriodQuery {
  period?: DashboardPeriod;
  /** ISO date (`YYYY-MM-DD`) — inclusive start of a custom range. */
  from?: string;
  /** ISO date (`YYYY-MM-DD`) — inclusive end of a custom range. */
  to?: string;
}

/** Why a custom range is unusable — the caller maps it to its own copy. */
export type DashboardRangeIssue = "incomplete" | "unparseable" | "reversed";

/**
 * The one rule for a period query: a custom range needs both ends, both
 * parseable, and `from` on or before `to`. Daily/monthly ignore `from`/`to`.
 *
 * Returns `null` when the query is valid, otherwise the reason — so the API
 * DTO, the range resolver and the admin filter validate against the same
 * definition instead of each re-deciding what a valid range is.
 */
export function dashboardRangeIssue(
  query: DashboardPeriodQuery | undefined,
): DashboardRangeIssue | null {
  if ((query?.period ?? DEFAULT_DASHBOARD_PERIOD) !== "custom") return null;

  const { from, to } = query ?? {};
  if (!from || !to) return "incomplete";

  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return "unparseable";
  if (fromTime > toTime) return "reversed";

  return null;
}

/** The resolved window the API actually measured, echoed back for the UI. */
export interface DashboardPeriodRange {
  type: DashboardPeriod;
  /** ISO timestamp, inclusive. */
  from: string;
  /** ISO timestamp, inclusive. */
  to: string;
}

/**
 * One metric, measured four ways from a single definition. `period` is the
 * ONLY figure the period filter changes; `yesterday`, `thisMonth` and
 * `allTime` are fixed and identical no matter what the filter is set to —
 * there is no period-over-period trend (removed: a % next to a headline that
 * also shows three fixed comparisons was one comparison too many).
 */
export interface DashboardMetric {
  period: number;
  /** The full calendar day before today (Europe/Istanbul), fixed. */
  yesterday: number;
  /** The 1st of the current month (Europe/Istanbul) through now, fixed. */
  thisMonth: number;
  /** Fixed. */
  allTime: number;
}

/**
 * Zone C — "Dönem özeti". The only date-filtered zone, and every metric is
 * measured from an EVENT stamp (`Payment.paidAt`, `Order.deliveredAt`,
 * `Order.cancelledAt`, `CommissionLedger.earnedAt`, `PayoutTransfer.processedAt`,
 * `RefundAttempt.finalizedAt`, `Trade.completedAt`, …) rather than from
 * `status + createdAt`: an order placed in March and delivered in April
 * belongs to April's delivered figure, not March's.
 *
 * Every money figure gets a SEPARATE count card next to it (how many, how
 * much) — the two answer different operational questions, and folding them
 * into one card hides whichever half wasn't the headline.
 */
export const DASHBOARD_METRIC_KEYS = [
  "paidOrders",
  "paidAmount",
  // Kullanıcılara ödenen hak ediş (satıcı escrow + takas nakit hak edişi).
  "sellerPayoutCount",
  "sellerPayoutAmount",
  // Kullanıcılara ödenen İADE (teslim edilmiş siparişin finalize iadesi).
  "returnRefundCount",
  "returnRefundAmount",
  // Kullanıcılara ödenen İPTAL (teslim edilmemiş siparişin finalize iadesi).
  "cancelRefundCount",
  "cancelRefundAmount",
  "cancelledOrders",
  "completedTrades",
  // Tamamlanan takasta İKİ taraftan toplam tahsil edilen nakit.
  "completedTradeAmount",
  "tradeFeeRevenue",
  "netRevenue",
  "netRevenueCount",
  // Tarodan hizmet bedelleri (alıcı + satıcı, iadeler düşülmüş).
  "serviceFeeCount",
  "serviceFeeAmount",
  // Tarodan komisyonları (alıcı + satıcı, iadeler düşülmüş).
  "commissionCount",
  "commissionAmount",
  // Toplam kargo (paket başına, alıcı+satıcı payı birlikte).
  "shippingCount",
  "shippingAmount",
  "deliveredOrders",
  "deliveredAmount",
  "membershipRevenue",
  "membershipCount",
  "boostRevenue",
  "boostCount",
  "newUsers",
  "newListings",
  "signedInUsers",
] as const;

export type DashboardMetricKey = (typeof DASHBOARD_METRIC_KEYS)[number];

export interface DashboardStatsResponse {
  range: DashboardPeriodRange;
  metrics: Record<DashboardMetricKey, DashboardMetric>;
}

// ===========================================================================
// Zone A — "Bekleyen işler" (action queues). NEVER date-filtered: an item that
// has been waiting since March is exactly the thing today's operator must see.
// ===========================================================================

export const DASHBOARD_QUEUE_KEYS = [
  "refundRequests",
  "tradeOperations",
  "listingModeration",
  "sellerApplications",
  "supportAndReports",
  "moneyOperations",
  "documents",
  "shipping",
] as const;

export type DashboardQueueKey = (typeof DASHBOARD_QUEUE_KEYS)[number];

/** Every countable line inside a queue tile, flat, so links stay per-line. */
export const DASHBOARD_QUEUE_PART_KEYS = [
  // refundRequests
  "refundsPendingReview",
  "refundsDisputed",
  // tradeOperations
  "tradesAtWarehouse",
  "tradeDisputesOpen",
  "tradeRefundFailures",
  "tradeCompensationPending",
  // listingModeration
  "productsPending",
  "messagesPendingApproval",
  // sellerApplications
  "corporateApplications",
  "sellerDocuments",
  // supportAndReports
  "ticketsOpen",
  "ticketsUrgent",
  "reportsPending",
  // moneyOperations
  "payoutsFailed",
  "holdsOverdue",
  "adjustmentsOpen",
  // documents
  "invoicesExhausted",
  "ordersUninvoiced",
  // shipping
  "carrierCancellations",
  "shipmentsWithoutTracking",
] as const;

export type DashboardQueuePartKey = (typeof DASHBOARD_QUEUE_PART_KEYS)[number];

/** Which tile a line belongs to — the grouping the API and the UI share. */
export const DASHBOARD_QUEUE_PARTS: Record<
  DashboardQueueKey,
  readonly DashboardQueuePartKey[]
> = {
  refundRequests: ["refundsPendingReview", "refundsDisputed"],
  tradeOperations: [
    "tradesAtWarehouse",
    "tradeDisputesOpen",
    "tradeRefundFailures",
    "tradeCompensationPending",
  ],
  listingModeration: ["productsPending", "messagesPendingApproval"],
  sellerApplications: ["corporateApplications", "sellerDocuments"],
  supportAndReports: ["ticketsOpen", "ticketsUrgent", "reportsPending"],
  moneyOperations: ["payoutsFailed", "holdsOverdue", "adjustmentsOpen"],
  documents: ["invoicesExhausted", "ordersUninvoiced"],
  shipping: ["carrierCancellations", "shipmentsWithoutTracking"],
};

/**
 * The admin screen each line owns. A queue tile is useless without the screen
 * that clears it, so the link lives with the definition instead of being
 * re-guessed in JSX.
 */
export const DASHBOARD_QUEUE_PART_LINKS: Record<DashboardQueuePartKey, string> =
  {
    // İadeler sekmesi, kuyruğun kendi durumuyla süzülmüş.
    refundsPendingReview: `${ADMIN_REFUNDS_VIEW_HREF}&status=pending_review`,
    refundsDisputed: `${ADMIN_REFUNDS_VIEW_HREF}&status=disputed`,
    tradesAtWarehouse: ADMIN_TRADES_TAB_HREF,
    tradeDisputesOpen: ADMIN_TRADES_TAB_HREF,
    tradeRefundFailures: ADMIN_TRADES_TAB_HREF,
    tradeCompensationPending: ADMIN_TRADES_TAB_HREF,
    productsPending: "/catalog/products",
    messagesPendingApproval: "/messaging/messages",
    corporateApplications: "/accounts/seller-applications",
    sellerDocuments: "/accounts/seller-applications",
    ticketsOpen: "/messaging/support",
    ticketsUrgent: "/messaging/support",
    reportsPending: "/accounts/reports",
    payoutsFailed: "/finance/payouts",
    holdsOverdue: "/finance/overview",
    adjustmentsOpen: "/finance/overview",
    invoicesExhausted: "/finance/invoices",
    ordersUninvoiced: "/finance/invoices",
    carrierCancellations: "/operations/shipping",
    shipmentsWithoutTracking: "/operations/shipping",
  };

/** The tile's own link — the screen that clears most of it. */
export const DASHBOARD_QUEUE_LINKS: Record<DashboardQueueKey, string> = {
  refundRequests: ADMIN_REFUNDS_VIEW_HREF,
  tradeOperations: ADMIN_TRADES_TAB_HREF,
  listingModeration: "/catalog/products",
  sellerApplications: "/accounts/seller-applications",
  supportAndReports: "/messaging/support",
  moneyOperations: "/finance/payouts",
  documents: "/finance/invoices",
  shipping: "/operations/shipping",
};

export interface DashboardQueuePart {
  key: DashboardQueuePartKey;
  count: number;
  /** Age driver: when the oldest waiting item entered the queue. */
  oldestAt: string | null;
  /** Only where money is the unit of work (open seller debt). */
  amount?: number;
  href: string;
}

export interface DashboardQueueTile {
  key: DashboardQueueKey;
  /** Sum of the tile's lines, minus lines flagged as a subset of another. */
  total: number;
  oldestAt: string | null;
  parts: DashboardQueuePart[];
  href: string;
}

// ===========================================================================
// Zone B — "Uyarılar". Rows that should normally be absent; hidden at zero.
// ===========================================================================

export const DASHBOARD_ALERT_KEYS = [
  "stuckShippedOrders",
  "stuckWarehouseTrades",
  "stuckOutboundTrades",
  "paymentsMissingFromStatement",
  "unresolvedStatementLines",
  "commissionLedgerDrift",
  "paymentsWithoutOrders",
  "ordersWithoutHold",
  "outboxDead",
  "outboxStuckProcessing",
  "noActiveCommissionRuleSet",
  "noActiveShippingTariff",
  "staleCouponReservations",
  "deliveredHoldsWithoutRelease",
  "agedCarrierCancellations",
  "exhaustedPayoutRetries",
  "preparingDeadlineWithin24h",
] as const;

export type DashboardAlertKey = (typeof DASHBOARD_ALERT_KEYS)[number];

/** How loud a row is. `info` is an early warning, not yet a failure. */
export type DashboardAlertSeverity = "critical" | "warning" | "info";

/**
 * The threshold that produced the row, echoed so the UI can say "10 günden
 * uzun" without keeping its own copy of a number that lives in config.
 */
export interface DashboardAlertThreshold {
  value: number;
  unit: "days" | "hours" | "minutes" | "attempts";
}

export interface DashboardAlert {
  key: DashboardAlertKey;
  count: number;
  /** Money-shaped alerts (ledger drift) report an amount, not a count. */
  amount?: number;
  threshold?: DashboardAlertThreshold;
  severity: DashboardAlertSeverity;
  href: string;
}

export const DASHBOARD_ALERT_LINKS: Record<DashboardAlertKey, string> = {
  stuckShippedOrders: "/operations/shipping",
  stuckWarehouseTrades: ADMIN_TRADES_TAB_HREF,
  stuckOutboundTrades: ADMIN_TRADES_TAB_HREF,
  paymentsMissingFromStatement: "/finance/psp",
  unresolvedStatementLines: "/finance/psp",
  commissionLedgerDrift: "/finance/overview",
  paymentsWithoutOrders: "/finance/overview",
  ordersWithoutHold: "/finance/overview",
  outboxDead: "/system/logs",
  outboxStuckProcessing: "/system/logs",
  noActiveCommissionRuleSet: "/finance/commission",
  noActiveShippingTariff: "/system/shipping-tariffs",
  staleCouponReservations: "/marketing/discounts",
  deliveredHoldsWithoutRelease: "/finance/payouts",
  agedCarrierCancellations: "/operations/shipping",
  exhaustedPayoutRetries: "/finance/payouts",
  preparingDeadlineWithin24h: ADMIN_ORDERS_PATH,
};

/** Zone A + Zone B — one request, because both answer "what needs me now?". */
export interface DashboardWorklistResponse {
  generatedAt: string;
  queues: DashboardQueueTile[];
  alerts: DashboardAlert[];
}

// ===========================================================================
// Zone D — "Şu anki durum" (stock). Balances, not flows: never date-filtered.
// ===========================================================================

export const DASHBOARD_STOCK_KEYS = [
  "escrowBalance",
  "openSellerDebt",
  "activeListings",
  "activeMemberships",
  "activeBoosts",
] as const;

export type DashboardStockKey = (typeof DASHBOARD_STOCK_KEYS)[number];

export interface DashboardMembershipTierCount {
  tierType: string;
  tierName: string;
  count: number;
}

export interface DashboardStockResponse {
  generatedAt: string;
  values: Record<DashboardStockKey, number>;
  /** No admin screen breaks active memberships down by tier today. */
  membershipsByTier: DashboardMembershipTierCount[];
}
