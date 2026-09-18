import {
  DASHBOARD_METRIC_KEYS,
  type DashboardMetric,
  type DashboardMetricKey,
} from "@tarodan/types";

export type DashboardMetrics = Record<DashboardMetricKey, DashboardMetric>;

const EMPTY_METRIC: DashboardMetric = {
  period: 0,
  previous: 0,
  allTime: 0,
  changePercent: 0,
};

/**
 * Coerce the dashboard response into the metric map the cards read.
 *
 * The dashboard tolerates a failing or not-yet-deployed endpoint (see
 * `useDashboard`), so a missing metric renders as zeros instead of blanking
 * the screen, and Decimal figures arriving as strings become numbers.
 */
export function toDashboardMetrics(raw: unknown): DashboardMetrics {
  const source = (raw ?? {}) as Partial<Record<DashboardMetricKey, unknown>>;
  const metrics = {} as DashboardMetrics;

  for (const key of DASHBOARD_METRIC_KEYS) {
    const entry = source[key];
    if (!entry || typeof entry !== "object") {
      metrics[key] = { ...EMPTY_METRIC };
      continue;
    }
    const value = entry as Partial<Record<keyof DashboardMetric, unknown>>;
    metrics[key] = {
      period: Number(value.period ?? 0),
      previous: Number(value.previous ?? 0),
      allTime: Number(value.allTime ?? 0),
      changePercent: Number(value.changePercent ?? 0),
    };
  }

  return metrics;
}
