import { Prisma } from "@prisma/client";
import type {
  AnalyticsBreakdownRow,
  AnalyticsFunnelStep,
  AnalyticsGroupBy,
  AnalyticsMetric,
  AnalyticsSeries,
} from "@tarodan/types";
import { TR_TIME_ZONE } from "../../../../common/helpers/tr-calendar";

/**
 * The four shapes every analytics tab is built from, in one place.
 *
 * Each tab used to re-derive its own percentages, its own zero-handling and
 * its own "no data" rule; the same division showed a different answer on two
 * tabs. Aggregation itself happens in SQL — never `findMany` plus in-memory
 * grouping — and these helpers only turn the rows into the shared contract.
 */

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Prisma returns Decimal | bigint | string depending on the query shape. */
export const num = (value: unknown): number =>
  value == null ? 0 : Number(value);

/** Percent, rounded to one decimal. Zero denominator is 0, never Infinity. */
export const percent = (part: number, whole: number): number =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

/**
 * One metric against the preceding window. A comparison that was never
 * measured stays NULL — reporting it as 0 would read as "we halved", which is
 * a different claim from "we did not ask".
 */
export function metric(
  current: number,
  previous: number | null,
): AnalyticsMetric {
  const value = round2(current);
  if (previous === null) {
    return { current: value, previous: null, changePercent: null };
  }
  const before = round2(previous);
  const change =
    before === 0
      ? value === 0
        ? 0
        : 100
      : round2(((value - before) / Math.abs(before)) * 100);
  return { current: value, previous: before, changePercent: change };
}

/** A metric that is itself a ratio — rounded as a percentage, not as money. */
export function rateMetric(
  currentPart: number,
  currentWhole: number,
  previousPart: number | null,
  previousWhole: number | null,
): AnalyticsMetric {
  return metric(
    percent(currentPart, currentWhole),
    previousPart === null || previousWhole === null
      ? null
      : percent(previousPart, previousWhole),
  );
}

/** A raw bucketed row, whatever the query aliased its value to. */
export interface BucketRow {
  bucket: string;
  value: unknown;
}

/**
 * Fill a series over EVERY bucket of the range.
 *
 * Skipping empty buckets was the single most misleading thing the old charts
 * did: a week with two sales and five silent days drew as a flat line between
 * two points, and the gap read as "no measurement" rather than "no sales".
 */
export function toSeries<K extends string>(
  key: K,
  rows: BucketRow[],
  buckets: string[],
): AnalyticsSeries<K> {
  const byBucket = new Map(rows.map((row) => [row.bucket, num(row.value)]));
  return {
    key,
    points: buckets.map((bucket) => ({
      bucket,
      value: round2(byBucket.get(bucket) ?? 0),
    })),
  };
}

export interface BreakdownInput {
  key: string;
  label: string;
  count: number;
  amount: number;
}

/**
 * A breakdown, sorted by whatever it is ranked on and carrying each row's
 * share of the total.
 *
 * @param by Which column the share is a share OF. Count-only breakdowns
 *   (cancellation reasons, condition mix) would otherwise show every share as
 *   zero because their amount is always zero.
 */
export function toBreakdown(
  rows: BreakdownInput[],
  by: "amount" | "count" = "amount",
): AnalyticsBreakdownRow[] {
  const total = rows.reduce((sum, row) => sum + row[by], 0);
  return rows
    .map((row) => ({
      key: row.key,
      label: row.label,
      count: row.count,
      amount: round2(row.amount),
      share: percent(row[by], total),
    }))
    .sort((a, b) =>
      by === "amount" ? b.amount - a.amount : b.count - a.count,
    );
}

/**
 * A funnel, with each step's share of the first step and the share of the
 * previous step lost at it.
 *
 * The steps are counted from their OWN event stamps, so a step can exceed the
 * one before it when the earlier event happened before the window: a listing
 * created in March and sold in April is a sale this window with no creation in
 * it. The drop-off is clamped at zero rather than rendered as a negative loss.
 */
export function toFunnel(
  steps: ReadonlyArray<{ key: string; count: number }>,
): AnalyticsFunnelStep[] {
  const first = steps[0]?.count ?? 0;
  return steps.map((step, index) => {
    const previous = index === 0 ? step.count : steps[index - 1].count;
    return {
      key: step.key,
      count: step.count,
      conversionFromFirst: percent(step.count, first),
      dropOffFromPrevious:
        index === 0 ? 0 : percent(Math.max(0, previous - step.count), previous),
    };
  });
}

// ===========================================================================
// SQL bucketing
// ===========================================================================

const DATE_TRUNC_UNIT: Record<AnalyticsGroupBy, string> = {
  day: "day",
  week: "week",
  month: "month",
};

/**
 * The bucket expression, cut in the Türkiye calendar.
 *
 * Columns are `timestamp without time zone` holding UTC instants, so the
 * conversion is explicit: read them as UTC, then move to Türkiye. Bucketing in
 * SQL is also why these queries never load rows into memory to group them.
 *
 * @param column A LITERAL column reference from this file's callers
 *   (`"orders"."created_at"`), never anything derived from a request.
 */
export function bucketExpr(
  column: string,
  groupBy: AnalyticsGroupBy,
): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc(${DATE_TRUNC_UNIT[groupBy]}, ${Prisma.raw(
    column,
  )} AT TIME ZONE 'UTC' AT TIME ZONE ${TR_TIME_ZONE}), 'YYYY-MM-DD')`;
}

/** The same conversion for an expression that is compared, not bucketed. */
export function inTimeZone(column: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(
    column,
  )} AT TIME ZONE 'UTC' AT TIME ZONE ${TR_TIME_ZONE}`;
}
