import { BadRequestException } from "@nestjs/common";
import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  DEFAULT_ANALYTICS_GROUP_BY,
  analyticsRangeIssue,
  type AnalyticsGroupBy,
  type AnalyticsRange,
  type AnalyticsRangeIssue,
  type AnalyticsRangeQuery,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import {
  TR_TIME_ZONE,
  istanbulDayStart,
  trCalendarDate,
} from "../../../../common/helpers/tr-calendar";
import { i18nMessage } from "../../../i18n";
import {
  previousWindow,
  type DashboardDateWindow,
} from "../dashboard-period.helper";

/** Shared range rule → the catalog key the API answers with. */
const RANGE_ISSUE_KEY: Record<AnalyticsRangeIssue, MessageKey> = {
  incomplete: "server.admin.analytics.rangeIncomplete",
  unparseable: "server.admin.analytics.rangeUnparseable",
  reversed: "server.admin.analytics.rangeReversed",
  tooLong: "server.admin.analytics.rangeTooLong",
};

const DAY_MS = 86_400_000;

/**
 * The window every analytics tab measures, its buckets, and the preceding
 * window of equal length when the caller asked to compare.
 *
 * ONE timezone decides everything. The old screen cut its range bounds in the
 * process timezone and its day keys with `toISOString()` (UTC): on a UTC
 * server that silently shifted every Turkish day by three hours, and rows
 * between midnight and 03:00 landed in the previous day's bucket. Bounds and
 * buckets are both Türkiye calendar here, and the bucketing itself happens in
 * SQL against the same zone.
 */
export interface ResolvedAnalyticsRange {
  current: DashboardDateWindow;
  /** Null unless the caller asked to compare. */
  previous: DashboardDateWindow | null;
  groupBy: AnalyticsGroupBy;
  /**
   * EVERY bucket the range covers, in order, as `YYYY-MM-DD` at the bucket
   * start. A series is filled against this list, so a day with no rows shows
   * as zero instead of vanishing and letting the chart draw a straight line
   * across it.
   */
  buckets: string[];
  timeZone: string;
}

/** Monday of the Türkiye week containing `day` — `date_trunc('week', …)`. */
function weekStart(day: string): string {
  const at = istanbulDayStart(day);
  // `getUTCDay()` on the Türkiye midnight instant is the Türkiye weekday
  // (fixed UTC+03:00 since 2016, so 00:00 local is 21:00 the day before —
  // read the weekday from the local calendar instead of the instant).
  const weekday = new Date(`${day}T12:00:00+03:00`).getUTCDay();
  const backwards = (weekday + 6) % 7;
  return trCalendarDate(new Date(at.getTime() - backwards * DAY_MS));
}

/** First day of the Türkiye month containing `day`. */
function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The bucket `day` belongs to, matching Postgres `date_trunc` exactly. */
export function bucketOf(day: string, groupBy: AnalyticsGroupBy): string {
  if (groupBy === "week") return weekStart(day);
  if (groupBy === "month") return monthStart(day);
  return day;
}

/** Every bucket between two Türkiye days, inclusive, in order and deduplicated. */
export function bucketsBetween(
  fromDay: string,
  toDay: string,
  groupBy: AnalyticsGroupBy,
): string[] {
  const buckets: string[] = [];
  const end = istanbulDayStart(toDay).getTime();

  for (let at = istanbulDayStart(fromDay).getTime(); at <= end; at += DAY_MS) {
    const bucket = bucketOf(trCalendarDate(new Date(at)), groupBy);
    if (buckets[buckets.length - 1] !== bucket) buckets.push(bucket);
  }

  return buckets;
}

/**
 * Resolve the query into the window, its buckets and (optionally) the window
 * before it.
 *
 * With no `from`/`to` the screen opens on the last
 * {@link ANALYTICS_DEFAULT_RANGE_DAYS} Türkiye days, ending today.
 */
export function resolveAnalyticsRange(
  query: AnalyticsRangeQuery | undefined,
  now: Date = new Date(),
): ResolvedAnalyticsRange {
  // The DTO already enforces this; the guard keeps the resolver honest for
  // callers that build a query themselves (exports, jobs, specs).
  const issue = analyticsRangeIssue(query);
  if (issue) throw new BadRequestException(i18nMessage(RANGE_ISSUE_KEY[issue]));

  const toDay = query?.to ?? trCalendarDate(now);
  const fromDay =
    query?.from ??
    trCalendarDate(
      new Date(
        istanbulDayStart(toDay).getTime() -
          (ANALYTICS_DEFAULT_RANGE_DAYS - 1) * DAY_MS,
      ),
    );

  const current: DashboardDateWindow = {
    gte: istanbulDayStart(fromDay),
    // Inclusive end: the last millisecond of the Türkiye day.
    lte: new Date(istanbulDayStart(toDay).getTime() + DAY_MS - 1),
  };

  return {
    current,
    // Same arithmetic the dashboard's trend uses — one definition of "the
    // window before this one", not a second.
    previous: query?.compare ? previousWindow(current) : null,
    groupBy: query?.groupBy ?? DEFAULT_ANALYTICS_GROUP_BY,
    buckets: bucketsBetween(
      fromDay,
      toDay,
      query?.groupBy ?? DEFAULT_ANALYTICS_GROUP_BY,
    ),
    timeZone: TR_TIME_ZONE,
  };
}

/** The resolved window as the UI sees it. */
export function toAnalyticsRange(
  range: ResolvedAnalyticsRange,
): AnalyticsRange {
  return {
    from: range.current.gte.toISOString(),
    to: range.current.lte.toISOString(),
    groupBy: range.groupBy,
    compared: range.previous !== null,
    previousFrom: range.previous?.gte.toISOString() ?? null,
    previousTo: range.previous?.lte.toISOString() ?? null,
    timeZone: range.timeZone,
  };
}
