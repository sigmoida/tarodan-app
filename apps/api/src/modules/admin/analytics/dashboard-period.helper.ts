import { BadRequestException } from "@nestjs/common";
import {
  DEFAULT_DASHBOARD_PERIOD,
  dashboardRangeIssue,
  type DashboardPeriod,
  type DashboardPeriodQuery,
  type DashboardRangeIssue,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { i18nMessage } from "../../i18n";
import {
  istanbulDayEnd,
  istanbulDayStart,
  istanbulDayStartOf,
  istanbulYesterdayWindow,
  trMonthStart,
} from "../../../common/helpers/tr-calendar";

/** Shared range rule → the catalog key the API answers with. */
const RANGE_ISSUE_KEY: Record<DashboardRangeIssue, MessageKey> = {
  incomplete: "server.admin.dashboard.rangeIncomplete",
  unparseable: "server.admin.dashboard.rangeUnparseable",
  reversed: "server.admin.dashboard.rangeReversed",
};

/** Prisma `DateTime` filter for a closed window. */
export interface DashboardDateWindow {
  gte: Date;
  lte: Date;
}

/**
 * The window the dashboard measures. One resolution for every metric — no
 * metric computes its own dates.
 *
 * Every boundary is Türkiye calendar, not server-local: `apps/api` runs in
 * UTC in production, so a server-local "today" starts three hours early
 * (00:00 UTC = 03:00 Istanbul) and a server-local month can flip a day late.
 * See `common/helpers/tr-calendar.ts`.
 */
export interface ResolvedDashboardRange {
  type: DashboardPeriod;
  current: DashboardDateWindow;
}

/**
 * The window of the same length that ends where `current` begins.
 *
 * Exported for the analytics screen's "compare with previous period" — the
 * dashboard's own period filter no longer has a trend (product decision: a
 * period-over-period % next to a headline that also shows Dün/Bu ay/Tüm
 * zamanlar was one comparison too many), but the analytics screen still
 * answers the same "window before this one" question and must not grow a
 * second copy of this arithmetic.
 */
export function previousWindow(
  current: DashboardDateWindow,
): DashboardDateWindow {
  const length = current.lte.getTime() - current.gte.getTime();
  return {
    gte: new Date(current.gte.getTime() - length - 1),
    lte: new Date(current.gte.getTime() - 1),
  };
}

/**
 * Dünün (Türkiye takvimi) TAM günü — the fixed "Dün" figure every stat card
 * shows regardless of the period filter.
 */
export function resolveYesterdayWindow(
  now: Date = new Date(),
): DashboardDateWindow {
  return istanbulYesterdayWindow(now);
}

/**
 * Ayın Türkiye takvimindeki ilk gününden şimdiye kadar — the fixed "Bu ay"
 * figure. Unlike "Dün" this keeps growing through the day, so its cache entry
 * needs the same short TTL the live period gets (see the service).
 */
export function resolveThisMonthWindow(
  now: Date = new Date(),
): DashboardDateWindow {
  return { gte: trMonthStart(now), lte: now };
}

/**
 * Resolve the query into the concrete window the dashboard measures.
 *
 * - `daily` → today (Türkiye takvimi), midnight → now
 * - `monthly` → the 1st of the current month (Türkiye takvimi), midnight → now
 * - `custom` → `from` 00:00 → `to` 23:59:59.999, both Türkiye takvimi, both
 *   inclusive
 */
export function resolveDashboardRange(
  query: DashboardPeriodQuery | undefined,
  now: Date = new Date(),
): ResolvedDashboardRange {
  // The DTO already enforces this; the guard keeps the resolver honest for
  // callers that build a query themselves (jobs, specs).
  const issue = dashboardRangeIssue(query);
  if (issue) throw new BadRequestException(i18nMessage(RANGE_ISSUE_KEY[issue]));

  const type = query?.period ?? DEFAULT_DASHBOARD_PERIOD;
  const from = query?.from;
  const to = query?.to;

  if (type === "custom" && from && to) {
    return {
      type,
      current: { gte: istanbulDayStart(from), lte: istanbulDayEnd(to) },
    };
  }

  const current: DashboardDateWindow =
    type === "monthly"
      ? { gte: trMonthStart(now), lte: now }
      : { gte: istanbulDayStartOf(now), lte: now };

  return { type, current };
}
