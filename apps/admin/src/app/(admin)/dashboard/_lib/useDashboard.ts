"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type {
  DashboardPeriodQuery,
  DashboardPeriodRange,
} from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { toDashboardMetrics } from "./metrics";
import {
  type DashboardData,
  type PendingActions,
  type TopProduct,
  type TopSeller,
} from "./types";
import { toPeriodQuery, type DashboardPeriodSelection } from "./periodParams";

/** Build a 30-entry series (oldest→newest) from a date→value map. */
function last30Days(dayMap: Map<string, number>) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return dayMap.get(d.toISOString().split("T")[0]) ?? 0;
  });
}

async function fetchDashboard(
  query: DashboardPeriodQuery,
): Promise<DashboardData> {
  // Each widget loads independently: a single missing or failing endpoint (e.g.
  // a dashboard endpoint not yet deployed to the target API) must not blank the
  // whole page. Failed calls fall back to an empty response, so that one widget
  // just renders its empty state while the rest of the dashboard stays up.
  // (A 401 still redirects to login via the api-client interceptor.)
  const settled = await Promise.allSettled([
    adminApi.getDashboard(query),
    adminApi.getRecentOrders(5),
    adminApi.getPendingActions(),
    adminApi.getSalesAnalytics({ groupBy: "day" }),
    adminApi.getTrades({ limit: 5, sort: "createdAt:desc" }),
    adminApi.getTopProducts(10),
    adminApi.getTopSellers(10),
  ]);
  const at = (i: number, fallback: any) =>
    settled[i].status === "fulfilled"
      ? (settled[i] as PromiseFulfilledResult<any>).value
      : fallback;

  const dashboardRes = at(0, { data: {} });
  const ordersRes = at(1, { data: [] });
  const pendingRes = at(2, { data: null });
  const salesRes = at(3, { data: null });
  const tradesRes = at(4, { data: [] });
  const topProductsRes = at(5, { data: [] });
  const topSellersRes = at(6, { data: [] });

  // Güvenli erişim: `at()` geri düşüşleri (`{ data: null }`) ve boş gövde
  // dönen uçlar yüzünden `res.data` null olabiliyor.
  const data = dashboardRes.data?.data || dashboardRes.data || {};

  const metrics = toDashboardMetrics(data.metrics);
  const range: DashboardPeriodRange | null = data.range ?? null;

  const ordersData = ordersRes.data?.data || ordersRes.data || [];
  const recentOrders = Array.isArray(ordersData) ? ordersData : [];

  const tradesData = tradesRes.data?.data || tradesRes.data || [];
  const recentTrades = Array.isArray(tradesData) ? tradesData : [];

  const pendingData = pendingRes.data?.data || pendingRes.data;
  const pendingActions: PendingActions | null = pendingData
    ? {
        ...pendingData,
        identityVerificationRequests:
          pendingData.identityVerificationRequests ?? 0,
      }
    : null;

  // ── Analytics (30-day series) ──────────────────────────────────────────────
  let salesByDay = Array(30).fill(0);
  let ordersByDay = Array(30).fill(0);

  if (salesRes.data) {
    const salesData = salesRes.data?.data ?? salesRes.data;
    const dailyArray = Array.isArray(salesData)
      ? salesData
      : (salesData?.data ?? []);
    const salesMap = new Map<string, number>();
    const ordersMap = new Map<string, number>();
    dailyArray.forEach((d: any) => {
      const key = typeof d.date === "string" ? d.date.slice(0, 10) : d.date;
      if (key) {
        salesMap.set(key, Number(d.totalSales ?? d.amount ?? 0));
        ordersMap.set(key, Number(d.orderCount ?? d.orders ?? 0));
      }
    });
    salesByDay = last30Days(salesMap);
    ordersByDay = last30Days(ordersMap);
  }

  const topProductsData =
    topProductsRes.data?.data || topProductsRes.data || [];
  const topProducts: TopProduct[] = Array.isArray(topProductsData)
    ? topProductsData
    : [];

  const topSellersData = topSellersRes.data?.data || topSellersRes.data || [];
  const topSellers: TopSeller[] = Array.isArray(topSellersData)
    ? topSellersData
    : [];

  return {
    metrics,
    range,
    recentOrders,
    recentTrades,
    pendingActions,
    analytics: { salesByDay, ordersByDay },
    topProducts,
    topSellers,
  };
}

/**
 * Loads all dashboard data for the selected period. The period is part of the
 * query key, so switching it refetches instead of re-deriving numbers locally.
 */
export function useDashboard(selection: DashboardPeriodSelection) {
  const query = toPeriodQuery(selection);
  const result = useSuspenseQuery({
    queryKey: [...adminKeys.all("dashboard"), query],
    queryFn: () => fetchDashboard(query),
  });
  return result.data;
}
