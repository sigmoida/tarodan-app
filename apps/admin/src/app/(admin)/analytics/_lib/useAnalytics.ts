"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import {
  type AnalyticsData,
  type DateRange,
  getDateRangeParams,
} from "./types";

function normalizeProductReport(raw: any) {
  return {
    totalProducts: raw.total ?? raw.totalProducts ?? 0,
    activeProducts: raw.active ?? raw.activeProducts ?? 0,
    pendingProducts: raw.pending ?? raw.pendingProducts ?? 0,
    averagePrice: raw.averagePrice ?? 0,
    categoryDistribution: raw.categoryDistribution ?? raw.categories ?? [],
  };
}

function normalizeTradeReport(raw: any) {
  return {
    totalTrades: raw.total ?? raw.totalTrades ?? 0,
    completedTrades: raw.completedTrades ?? 0,
    pendingTrades: raw.pendingTrades ?? 0,
    disputedTrades: raw.disputedTrades ?? 0,
    averageTradeValue: raw.averageTradeValue ?? 0,
  };
}

function hasReportData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}

// ─── Fetch + normalize all four reports ──────────────────────────────────────

async function fetchAnalytics(dateRange: DateRange): Promise<AnalyticsData> {
  const params = { ...getDateRangeParams(dateRange), groupBy: "day" as const };

  const [salesRes, revenueRes, userRes, productRes, tradeRes] =
    await Promise.all([
      adminApi.getSalesAnalytics(params),
      adminApi.getRevenueAnalytics(params),
      adminApi.getUserAnalytics(params),
      adminApi.getProductReport(params),
      adminApi.getTradeReport(params),
    ]);

  const salesData = salesRes?.data?.data ?? salesRes?.data;
  const salesSummary = salesRes?.data?.summary ?? {};
  const revenueSummary = revenueRes?.data?.summary ?? {};
  const userData = userRes?.data?.data ?? userRes?.data;
  const userSummary = userRes?.data?.summary ?? {};
  const productData = productRes?.data?.data ?? productRes?.data;
  const tradeData = tradeRes?.data?.data ?? tradeRes?.data;

  const dailyArray = Array.isArray(salesData)
    ? salesData
    : (salesData?.data ?? []);
  const dailyData = dailyArray.map((d: any) => ({
    date: typeof d.date === "string" ? d.date : d.date?.slice(0, 10),
    orders: Number(d.orderCount ?? d.orders ?? 0),
    revenue: Number(d.totalSales ?? d.revenue ?? 0),
  }));

  const userGrowthArray = Array.isArray(userData)
    ? userData
    : (userData?.data ?? []);
  const userGrowth = userGrowthArray.map((d: any) => ({
    month:
      typeof d.date === "string"
        ? d.date.slice(5)
        : (d.date?.slice(0, 7) ?? ""),
    users: Number(d.newUsers ?? d.users ?? 0),
  }));

  return {
    salesReport: {
      totalOrders: salesSummary.totalOrders ?? 0,
      totalRevenue: salesSummary.totalSales ?? 0,
      totalCommission: revenueSummary.totalCommission ?? 0,
      averageOrderValue: salesSummary.averageOrderValue ?? 0,
      ordersByStatus: salesSummary.ordersByStatus ?? {},
      dailyData,
    },
    userReport: {
      totalUsers: userSummary.totalUsers ?? 0,
      newUsers: userSummary.totalNewUsers ?? 0,
      activeUsers: userSummary.averageDailyActiveUsers ?? 0,
      sellerCount: userSummary.totalNewSellers ?? 0,
      userGrowth,
    },
    productReport: productData
      ? normalizeProductReport(productData)
      : {
          totalProducts: 0,
          activeProducts: 0,
          pendingProducts: 0,
          averagePrice: 0,
          categoryDistribution: [],
        },
    tradeReport: tradeData
      ? normalizeTradeReport(tradeData)
      : {
          totalTrades: 0,
          completedTrades: 0,
          pendingTrades: 0,
          disputedTrades: 0,
          averageTradeValue: 0,
        },
    availability: {
      sales:
        dailyData.length > 0 ||
        Object.keys(salesSummary).length > 0 ||
        Object.keys(revenueSummary).length > 0,
      users: userGrowth.length > 0 || Object.keys(userSummary).length > 0,
      products: hasReportData(productData),
      trades: hasReportData(tradeData),
    },
  };
}

/** Loads + normalizes all analytics reports for the selected range (TanStack Query). */
export function useAnalytics(dateRange: DateRange) {
  const query = useSuspenseQuery({
    queryKey: adminKeys.list("analytics", dateRange),
    queryFn: () => fetchAnalytics(dateRange),
  });
  return query.data;
}
