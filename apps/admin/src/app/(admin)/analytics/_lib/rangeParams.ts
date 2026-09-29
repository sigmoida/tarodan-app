import {
  ANALYTICS_DEFAULT_RANGE_DAYS,
  DEFAULT_ANALYTICS_GROUP_BY,
  isAnalyticsGroupBy,
  type AnalyticsGroupBy,
  type AnalyticsRangeQuery,
} from "@tarodan/types";

/** The filter's full state — the range always has both ends. */
export interface AnalyticsRangeSelection {
  from: string;
  to: string;
  groupBy: AnalyticsGroupBy;
  compare: boolean;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in the admin's own timezone (what `<input type="date">` wants). */
export function toDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Read the filter out of the URL, so a filtered screen survives a reload and
 * can be shared as a link. A missing or unusable value falls back to the
 * default window, so the selection handed to the API is always complete.
 */
export function readRangeParams(
  params: URLSearchParams,
  today: Date = new Date(),
): AnalyticsRangeSelection {
  const groupBy = params.get("groupBy");
  const to = params.get("to") || toDateInputValue(today);
  const from =
    params.get("from") ||
    toDateInputValue(
      new Date(
        new Date(`${to}T00:00:00`).getTime() -
          (ANALYTICS_DEFAULT_RANGE_DAYS - 1) * DAY_MS,
      ),
    );

  return {
    from,
    to,
    groupBy: isAnalyticsGroupBy(groupBy) ? groupBy : DEFAULT_ANALYTICS_GROUP_BY,
    compare: params.get("compare") === "1",
  };
}

/**
 * Write the selection back, keeping every other query param (the active tab
 * among them). Defaults are dropped so the common case stays a clean
 * `/analytics` URL.
 */
export function writeRangeParams(
  params: URLSearchParams,
  selection: AnalyticsRangeSelection,
  today: Date = new Date(),
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const fallback = readRangeParams(new URLSearchParams(), today);

  if (selection.from === fallback.from) next.delete("from");
  else next.set("from", selection.from);

  if (selection.to === fallback.to) next.delete("to");
  else next.set("to", selection.to);

  if (selection.groupBy === DEFAULT_ANALYTICS_GROUP_BY) next.delete("groupBy");
  else next.set("groupBy", selection.groupBy);

  if (selection.compare) next.set("compare", "1");
  else next.delete("compare");

  return next;
}

/** The selection as the API query — one shape for the screen and the export. */
export function toRangeQuery(
  selection: AnalyticsRangeSelection,
): AnalyticsRangeQuery {
  return {
    from: selection.from,
    to: selection.to,
    groupBy: selection.groupBy,
    // Only travels when asked: an unmeasured comparison must come back null,
    // not zero.
    ...(selection.compare ? { compare: true } : {}),
  };
}
