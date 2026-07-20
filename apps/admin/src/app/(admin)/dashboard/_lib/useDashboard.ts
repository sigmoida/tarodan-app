"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import {
  EMPTY_PERIODS,
  type DashboardData,
  type DashboardStats,
  type MetricPeriods,
  type PendingActions,
  type TopProduct,
  type TopSeller,
  type VisitorStats,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;

const EMPTY_VISITORS: VisitorStats = {
  liveVisitors: 0,
  dailyActiveVisitors: 0,
};

const EMPTY_STATS: DashboardStats = {
  totalOrders: 0,
  totalOrdersPeriods: EMPTY_PERIODS,
  netCommissionTotal: 0,
  netCommissionPeriods: EMPTY_PERIODS,
  activeProducts: 0,
  passiveProducts: 0,
  activeProductsPeriods: EMPTY_PERIODS,
  passiveProductsPeriods: EMPTY_PERIODS,
  activeUsers: 0,
  passiveUsers: 0,
  activeUsersPeriods: EMPTY_PERIODS,
  passiveUsersPeriods: EMPTY_PERIODS,
  grossSales: 0,
  grossSalesPeriods: EMPTY_PERIODS,
  netCommissionRow2: EMPTY_PERIODS,
  cancellations: 0,
  refunds: 0,
  cancellationsPeriods: EMPTY_PERIODS,
  refundsPeriods: EMPTY_PERIODS,
  pendingApprovals: 0,
};

/** Build a 30-entry series (oldest→newest) from a date→value map. */
function last30Days(dayMap: Map<string, number>) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return dayMap.get(d.toISOString().split("T")[0]) ?? 0;
  });
}

/** Coerce whatever the API returns into a MetricPeriods object; missing → zeros. */
function toPeriods(raw: unknown): MetricPeriods {
  if (!raw || typeof raw !== "object") return EMPTY_PERIODS;
  const r = raw as Partial<MetricPeriods>;
  return {
    yesterday: Number(r.yesterday ?? 0),
    thisMonth: Number(r.thisMonth ?? 0),
    lastMonth: Number(r.lastMonth ?? 0),
    changePercent: Number(r.changePercent ?? 0),
  };
}

async function fetchDashboard(t: T): Promise<DashboardData> {
  const [
    dashboardRes,
    ordersRes,
    pendingRes,
    salesRes,
    tradesRes,
    visitorsRes,
    topProductsRes,
    topSellersRes,
  ] = await Promise.all([
    adminApi.getDashboard(),
    adminApi.getRecentOrders(5),
    adminApi.getPendingActions(),
    adminApi.getSalesAnalytics({ groupBy: "day" }).catch(() => null),
    adminApi.getTrades({ limit: 5, sort: "createdAt:desc" }).catch(() => null),
    adminApi.getRealtimeVisitors().catch(() => null),
    adminApi.getTopProducts(10).catch(() => null),
    adminApi.getTopSellers(10).catch(() => null),
  ]);

  const data = dashboardRes.data.data || dashboardRes.data;

  // Gross sales and net commission are distinct backend fields (#295); no
  // longer conflated into one `totalRevenue` scalar.
  const grossSalesPeriods = toPeriods(data.grossSales);
  const netCommissionPeriods = toPeriods(data.netCommission);
  const activeProductsPeriods = toPeriods(data.activeProducts);
  const passiveProductsPeriods = toPeriods(data.passiveProducts);
  const activeUsersPeriods = toPeriods(data.activeUsers);
  const passiveUsersPeriods = toPeriods(data.passiveUsers);
  const cancellationsPeriods = toPeriods(data.cancellations);
  const refundsPeriods = toPeriods(data.refunds);
  const totalOrdersPeriods = toPeriods(data.orders);

  const stats: DashboardStats = {
    totalOrders: data.orders?.total || 0,
    totalOrdersPeriods,
    netCommissionTotal: Number(data.revenue?.total ?? 0),
    netCommissionPeriods,
    activeProducts: data.products?.active || 0,
    passiveProducts:
      typeof data.products?.passive === "number"
        ? data.products.passive
        : passiveProductsPeriods.thisMonth,
    activeProductsPeriods,
    passiveProductsPeriods,
    activeUsers:
      typeof data.users?.active === "number"
        ? data.users.active
        : activeUsersPeriods.thisMonth,
    passiveUsers:
      typeof data.users?.passive === "number"
        ? data.users.passive
        : passiveUsersPeriods.thisMonth,
    activeUsersPeriods,
    passiveUsersPeriods,
    grossSales: grossSalesPeriods.thisMonth,
    grossSalesPeriods,
    netCommissionRow2: netCommissionPeriods,
    cancellations: cancellationsPeriods.thisMonth,
    refunds: refundsPeriods.thisMonth,
    cancellationsPeriods,
    refundsPeriods,
    pendingApprovals: data.products?.pending || 0,
  };

  const visitorsData = visitorsRes?.data?.data || visitorsRes?.data || null;
  const visitors: VisitorStats = visitorsData
    ? {
        liveVisitors: Number(visitorsData.liveVisitors ?? 0),
        dailyActiveVisitors: Number(visitorsData.dailyActiveVisitors ?? 0),
      }
    : EMPTY_VISITORS;

  const ordersData = ordersRes.data.data || ordersRes.data || [];
  const recentOrders = Array.isArray(ordersData) ? ordersData : [];

  const tradesData = tradesRes?.data?.data || tradesRes?.data || [];
  const recentTrades = Array.isArray(tradesData) ? tradesData : [];

  const pendingData = pendingRes.data.data || pendingRes.data;
  const pendingActions: PendingActions | null = pendingData
    ? {
        ...pendingData,
        identityVerificationRequests:
          pendingData.identityVerificationRequests ?? 0,
      }
    : null;

  // ── Analytics (30-day series + category distribution) ──────────────────────
  let categoryDistribution: { name: string; count: number }[] = Array.isArray(
    data.categoryDistribution,
  )
    ? data.categoryDistribution.map((c: { name: string; count: number }) => ({
        name: c.name || t("admin.dashboard.charts.uncategorized"),
        count: typeof c.count === "number" ? c.count : 0,
      }))
    : [];

  let salesByDay = Array(30).fill(0);
  let ordersByDay = Array(30).fill(0);

  if (salesRes?.data) {
    const salesData = salesRes.data.data ?? salesRes.data;
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
    if (salesData && !Array.isArray(salesData)) {
      categoryDistribution =
        salesData.categoryDistribution ??
        salesData.categories ??
        categoryDistribution;
    }
  }

  const topProductsData =
    topProductsRes?.data?.data || topProductsRes?.data || [];
  const topProducts: TopProduct[] = Array.isArray(topProductsData)
    ? topProductsData
    : [];

  const topSellersData = topSellersRes?.data?.data || topSellersRes?.data || [];
  const topSellers: TopSeller[] = Array.isArray(topSellersData)
    ? topSellersData
    : [];

  return {
    stats,
    visitors,
    recentOrders,
    recentTrades,
    pendingActions,
    analytics: { salesByDay, ordersByDay, categoryDistribution },
    topProducts,
    topSellers,
  };
}

/** Loads all dashboard data (stats, recent orders/trades, pending, analytics). */
export function useDashboard() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDashboard(t),
  });
  return {
    data: query.data,
    loading: query.isLoading,
    stats: query.data?.stats ?? EMPTY_STATS,
    visitors: query.data?.visitors ?? EMPTY_VISITORS,
  };
}
