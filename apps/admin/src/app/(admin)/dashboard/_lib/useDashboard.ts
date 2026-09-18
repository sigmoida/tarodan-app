"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardPeriodQuery,
  DashboardStatsResponse,
  DashboardStockResponse,
  DashboardWorklistResponse,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { toDashboardMetrics, type DashboardMetrics } from "./metrics";
import type { RecentOrder, RecentTrade, TopProduct, TopSeller } from "./types";
import { toPeriodQuery, type DashboardPeriodSelection } from "./periodParams";

/**
 * The dashboard's four zones load INDEPENDENTLY.
 *
 * One request used to carry everything, so the slowest number on the page
 * decided when any of it appeared — and a single failing endpoint blanked the
 * screen. Each zone is now its own query with its own loading and error state:
 * the work queues paint as soon as they arrive, whatever the rest is doing.
 */

/** Never poll faster than this. Operations tempo, not a live ticker. */
export const DASHBOARD_REFETCH_MS = 60_000;

/** The API's response envelope varies by endpoint; unwrap it in one place. */
function unwrap<T>(response: unknown, fallback: T): T {
  const body = (response as { data?: unknown })?.data;
  const inner = (body as { data?: unknown })?.data;
  return (inner ?? body ?? fallback) as T;
}

const asArray = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

/** Zone A + B — the action queues and the alert strip. */
export function useDashboardWorklist() {
  return useQuery({
    queryKey: adminKeys.all("dashboard-worklist"),
    queryFn: async (): Promise<DashboardWorklistResponse> => {
      const response = await adminApi.getDashboardWorklist();
      return unwrap<DashboardWorklistResponse>(response, {
        generatedAt: new Date().toISOString(),
        queues: [],
        alerts: [],
      });
    },
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}

/** Zone C — the only zone the period filter touches. */
export function useDashboardStats(selection: DashboardPeriodSelection) {
  const query: DashboardPeriodQuery = toPeriodQuery(selection);

  return useQuery({
    queryKey: [...adminKeys.all("dashboard-stats"), query],
    queryFn: async (): Promise<{
      metrics: DashboardMetrics;
      range: DashboardStatsResponse["range"] | null;
    }> => {
      const response = await adminApi.getDashboard(query);
      const body = unwrap<Partial<DashboardStatsResponse>>(response, {});
      return {
        metrics: toDashboardMetrics(body.metrics),
        range: body.range ?? null,
      };
    },
  });
}

/** Zone D — balances. */
export function useDashboardStock() {
  return useQuery({
    queryKey: adminKeys.all("dashboard-stock"),
    queryFn: async (): Promise<DashboardStockResponse | null> =>
      unwrap<DashboardStockResponse | null>(
        await adminApi.getDashboardStock(),
        null,
      ),
    refetchInterval: DASHBOARD_REFETCH_MS,
  });
}

/** Zone E — the two recent-activity lists, loaded together. */
export function useDashboardLists() {
  return useQuery({
    queryKey: adminKeys.all("dashboard-lists"),
    queryFn: async () => {
      const [orders, trades] = await Promise.allSettled([
        adminApi.getRecentOrders(8),
        adminApi.getTrades({ limit: 5, sort: "createdAt:desc" }),
      ]);
      return {
        recentOrders:
          orders.status === "fulfilled"
            ? asArray<RecentOrder>(unwrap(orders.value, []))
            : [],
        recentTrades:
          trades.status === "fulfilled"
            ? asArray<RecentTrade>(unwrap(trades.value, []))
            : [],
      };
    },
  });
}

/**
 * The all-time widgets. `viewCount` / `storeViewCount` are cumulative counters
 * with no per-day history, so these two CANNOT follow the period filter —
 * the screen says so rather than implying otherwise.
 */
export function useDashboardTopLists() {
  return useQuery({
    queryKey: adminKeys.all("dashboard-top"),
    queryFn: async () => {
      const [products, sellers] = await Promise.allSettled([
        adminApi.getTopProducts(10),
        adminApi.getTopSellers(10),
      ]);
      return {
        topProducts:
          products.status === "fulfilled"
            ? asArray<TopProduct>(unwrap(products.value, []))
            : [],
        topSellers:
          sellers.status === "fulfilled"
            ? asArray<TopSeller>(unwrap(sellers.value, []))
            : [],
      };
    },
  });
}

/**
 * The explicit refresh control: drop the server-side caches, then re-read every
 * zone. Without the first step the screen would just re-serve the same cached
 * body and the button would look broken.
 */
export function useDashboardRefresh() {
  const queryClient = useQueryClient();

  return async () => {
    try {
      await adminApi.refreshDashboard();
    } finally {
      await Promise.all(
        [
          "dashboard-worklist",
          "dashboard-stats",
          "dashboard-stock",
          "dashboard-lists",
          "dashboard-top",
        ].map((resource) =>
          queryClient.invalidateQueries({ queryKey: adminKeys.all(resource) }),
        ),
      );
    }
  };
}
