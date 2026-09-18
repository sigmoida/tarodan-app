"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  AnalyticsMetric,
  AnalyticsSeries,
  AnalyticsTab,
  AnalyticsTabResponse,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { toRangeQuery, type AnalyticsRangeSelection } from "./rangeParams";

/**
 * The shape every tab response shares, so one renderer can read any of them
 * without each tab casting to `any` (which is what the old screen did).
 */
export type AnalyticsTabData = {
  range: AnalyticsTabResponse[AnalyticsTab]["range"];
  metrics: Record<string, AnalyticsMetric>;
  series: AnalyticsSeries[];
} & Record<string, unknown>;

/** The API's response envelope varies by endpoint; unwrap it in one place. */
function unwrap(response: unknown): AnalyticsTabData | null {
  const body = (response as { data?: unknown })?.data;
  const inner = (body as { data?: unknown })?.data;
  const value = (inner ?? body) as AnalyticsTabData | undefined;
  return value && typeof value === "object" && "metrics" in value
    ? value
    : null;
}

/**
 * ONE tab, ONE request.
 *
 * The old screen fired all five reports on every render whatever tab you were
 * on, so the trades tab waited for the product report. There is no polling
 * either: analytics answers a question about the past, and a chart that
 * silently redraws under you while you read it is a misfeature.
 */
export function useAnalyticsTab(
  tab: AnalyticsTab,
  selection: AnalyticsRangeSelection,
) {
  const query = toRangeQuery(selection);

  return useQuery({
    queryKey: [...adminKeys.all("analytics"), tab, query],
    queryFn: async () => unwrap(await adminApi.getAnalyticsTab(tab, query)),
    // The server caches the same window; refetching on every focus would only
    // re-serve it over the network.
    refetchOnWindowFocus: false,
  });
}
