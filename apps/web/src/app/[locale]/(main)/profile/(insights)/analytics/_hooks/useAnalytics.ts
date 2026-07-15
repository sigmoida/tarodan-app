/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import {
  emptyAnalytics,
  normalizeAnalytics,
  type AnalyticsData,
  type AnalyticsPeriod,
} from "../_lib/types";

const RESOURCE = "profile-analytics";

/** Performance analytics for a period. Keyed by period so switching refetches
 * (the dataset genuinely changes per period). */
export function useAnalytics(period: AnalyticsPeriod, enabled: boolean) {
  const query = useWebList<AnalyticsData>({
    resource: RESOURCE,
    params: period,
    fetcher: async () => {
      try {
        const res = await api.get("/users/me/analytics", {
          params: { period },
        });
        return normalizeAnalytics(res.data);
      } catch {
        return emptyAnalytics(period);
      }
    },
    enabled,
    query: { meta: { page: "profile-analytics" } },
  });
  return { analytics: query.data ?? null, isLoading: query.isLoading };
}
