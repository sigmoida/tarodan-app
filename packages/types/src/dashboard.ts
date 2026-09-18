/**
 * Admin dashboard period filter — the contract shared by the API endpoint
 * (`GET /admin/dashboard`), its DTO and the admin dashboard screen.
 *
 * One period selection drives every stat card: the card's headline number is
 * the selected period, and the all-time figure is always returned alongside it
 * so the card can show both without a second request.
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
 * One metric, measured three ways from a single definition:
 * the selected period, the preceding window of equal length (for the trend),
 * and the all-time figure.
 */
export interface DashboardMetric {
  period: number;
  previous: number;
  allTime: number;
  /** `period` vs `previous`, in percent. */
  changePercent: number;
}

export const DASHBOARD_METRIC_KEYS = [
  "orders",
  "grossSales",
  "commissionRevenue",
  "netCommission",
  "activeProducts",
  "passiveProducts",
  "activeUsers",
  "passiveUsers",
  "cancellations",
  "refunds",
  "visitors",
] as const;

export type DashboardMetricKey = (typeof DASHBOARD_METRIC_KEYS)[number];

export interface DashboardStatsResponse {
  range: DashboardPeriodRange;
  metrics: Record<DashboardMetricKey, DashboardMetric>;
}
