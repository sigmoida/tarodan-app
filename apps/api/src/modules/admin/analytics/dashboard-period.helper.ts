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
 * The window the dashboard measures, plus the preceding window of equal length
 * used for the trend. One resolution for every metric — no metric computes its
 * own dates.
 */
export interface ResolvedDashboardRange {
  type: DashboardPeriod;
  current: DashboardDateWindow;
  previous: DashboardDateWindow;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );

/** The window of the same length that ends where `current` begins. */
function previousWindow(current: DashboardDateWindow): DashboardDateWindow {
  const length = current.lte.getTime() - current.gte.getTime();
  return {
    gte: new Date(current.gte.getTime() - length - 1),
    lte: new Date(current.gte.getTime() - 1),
  };
}

/**
 * Resolve the query into concrete windows.
 *
 * - `daily` → today, midnight → now
 * - `monthly` → the 1st of the current month, midnight → now
 * - `custom` → `from` 00:00 → `to` 23:59:59.999 (both inclusive)
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
    const current = {
      gte: startOfDay(new Date(from)),
      lte: endOfDay(new Date(to)),
    };
    return { type, current, previous: previousWindow(current) };
  }

  const current: DashboardDateWindow = {
    gte:
      type === "monthly"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : startOfDay(now),
    lte: now,
  };

  return { type, current, previous: previousWindow(current) };
}
