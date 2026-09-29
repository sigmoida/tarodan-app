import {
  DEFAULT_DASHBOARD_PERIOD,
  isDashboardPeriod,
  type DashboardPeriod,
  type DashboardPeriodQuery,
} from "@tarodan/types";

/** The filter's full state — a custom range always has both ends. */
export interface DashboardPeriodSelection {
  period: DashboardPeriod;
  from: string;
  to: string;
}

/** `YYYY-MM-DD` in the admin's own timezone (what `<input type="date">` wants). */
export function toDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Read the filter out of the URL. An unknown or missing period falls back to
 * the default, and a custom period with no dates opens on today — so the
 * selection handed to the API is always complete.
 */
export function readPeriodParams(
  params: URLSearchParams,
  today: Date = new Date(),
): DashboardPeriodSelection {
  const raw = params.get("period");
  const period = isDashboardPeriod(raw) ? raw : DEFAULT_DASHBOARD_PERIOD;
  const fallback = toDateInputValue(today);

  return {
    period,
    from: params.get("from") || fallback,
    to: params.get("to") || fallback,
  };
}

/**
 * Write the selection back, keeping every other query param. The default
 * period and the `from`/`to` of a non-custom period are dropped, so the common
 * case stays a clean `/dashboard` URL.
 */
export function writePeriodParams(
  params: URLSearchParams,
  selection: DashboardPeriodSelection,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());

  if (selection.period === DEFAULT_DASHBOARD_PERIOD) next.delete("period");
  else next.set("period", selection.period);

  if (selection.period === "custom") {
    next.set("from", selection.from);
    next.set("to", selection.to);
  } else {
    next.delete("from");
    next.delete("to");
  }

  return next;
}

/** The selection as the API query — `from`/`to` only travel for a custom range. */
export function toPeriodQuery(
  selection: DashboardPeriodSelection,
): DashboardPeriodQuery {
  return selection.period === "custom"
    ? { period: "custom", from: selection.from, to: selection.to }
    : { period: selection.period };
}
