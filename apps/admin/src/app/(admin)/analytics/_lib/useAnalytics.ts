'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { adminApi } from '@/lib/api';
import { type AnalyticsData, type DateRange, getDateRangeParams } from './types';

type T = ReturnType<typeof useTranslations<never>>;

// ─── Mock fallbacks (shown when an endpoint returns nothing) ─────────────────

function generateMockDailyData(dateRange: DateRange) {
  const days =
    dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
  return Array.from({ length: Math.min(days, 30) }, (_, i) => ({
    date: new Date(Date.now() - (days - i - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    orders: Math.floor(Math.random() * 50) + 10,
    revenue: Math.floor(Math.random() * 20000) + 5000,
  }));
}

function generateMockGrowthData() {
  return Array.from({ length: 12 }, (_, i) => ({
    month: new Date(Date.now() - (11 - i) * 30 * 24 * 60 * 60 * 1000).toLocaleString(
      'tr-TR',
      { month: 'short' },
    ),
    users: Math.floor(Math.random() * 500) + 100,
  }));
}

function generateMockCategoryData(t: T) {
  return [
    { name: 'Hot Wheels', count: 2345, percentage: 35 },
    { name: 'Matchbox', count: 1567, percentage: 23 },
    { name: 'Tomica', count: 987, percentage: 15 },
    { name: 'Majorette', count: 765, percentage: 11 },
    { name: 'Maisto', count: 543, percentage: 8 },
    { name: t('admin.analytics.categoryOther'), count: 536, percentage: 8 },
  ];
}

function normalizeProductReport(raw: any, t: T) {
  return {
    totalProducts: raw.total ?? raw.totalProducts ?? 0,
    activeProducts: raw.active ?? raw.activeProducts ?? 0,
    pendingProducts: raw.pending ?? raw.pendingProducts ?? 0,
    averagePrice: raw.averagePrice ?? 0,
    categoryDistribution:
      raw.categoryDistribution ?? raw.categories ?? generateMockCategoryData(t),
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

// ─── Fetch + normalize all four reports ──────────────────────────────────────

async function fetchAnalytics(dateRange: DateRange, t: T): Promise<AnalyticsData> {
  const params = { ...getDateRangeParams(dateRange), groupBy: 'day' as const };

  const [salesRes, revenueRes, userRes, productRes, tradeRes] = await Promise.all([
    adminApi.getSalesAnalytics(params).catch(() => ({ data: null })),
    adminApi.getRevenueAnalytics(params).catch(() => ({ data: null })),
    adminApi.getUserAnalytics(params).catch(() => ({ data: null })),
    adminApi.getProductReport(params).catch(() => ({ data: null })),
    adminApi.getTradeReport(params).catch(() => ({ data: null })),
  ]);

  const salesData = salesRes?.data?.data ?? salesRes?.data;
  const salesSummary = salesRes?.data?.summary ?? {};
  const revenueSummary = revenueRes?.data?.summary ?? {};
  const userData = userRes?.data?.data ?? userRes?.data;
  const userSummary = userRes?.data?.summary ?? {};

  const dailyArray = Array.isArray(salesData) ? salesData : (salesData?.data ?? []);
  const dailyData = dailyArray.map((d: any) => ({
    date: typeof d.date === 'string' ? d.date : d.date?.slice(0, 10),
    orders: Number(d.orderCount ?? d.orders ?? 0),
    revenue: Number(d.totalSales ?? d.revenue ?? 0),
  }));

  const userGrowthArray = Array.isArray(userData) ? userData : (userData?.data ?? []);
  const userGrowth = userGrowthArray.map((d: any) => ({
    month:
      typeof d.date === 'string' ? d.date.slice(5) : (d.date?.slice(0, 7) ?? ''),
    users: Number(d.newUsers ?? d.users ?? 0),
  }));

  return {
    salesReport: {
      totalOrders: salesSummary.totalOrders ?? 0,
      totalRevenue: salesSummary.totalSales ?? 0,
      totalCommission: revenueSummary.totalCommission ?? 0,
      averageOrderValue: salesSummary.averageOrderValue ?? 0,
      ordersByStatus: salesSummary.ordersByStatus ?? {},
      dailyData: dailyData.length > 0 ? dailyData : generateMockDailyData(dateRange),
    },
    userReport: {
      totalUsers: userSummary.totalUsers ?? 0,
      newUsers: userSummary.totalNewUsers ?? 0,
      activeUsers: userSummary.averageDailyActiveUsers ?? 0,
      sellerCount: userSummary.totalNewSellers ?? 0,
      userGrowth: userGrowth.length > 0 ? userGrowth : generateMockGrowthData(),
    },
    productReport: productRes?.data
      ? normalizeProductReport(productRes.data, t)
      : {
          totalProducts: 0,
          activeProducts: 0,
          pendingProducts: 0,
          averagePrice: 0,
          categoryDistribution: generateMockCategoryData(t),
        },
    tradeReport: tradeRes?.data
      ? normalizeTradeReport(tradeRes.data)
      : {
          totalTrades: 0,
          completedTrades: 0,
          pendingTrades: 0,
          disputedTrades: 0,
          averageTradeValue: 0,
        },
  };
}

/** Loads + normalizes all analytics reports for the selected range (TanStack Query). */
export function useAnalytics(dateRange: DateRange) {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ['analytics', dateRange],
    queryFn: () => fetchAnalytics(dateRange, t),
  });
  return { data: query.data, loading: query.isLoading };
}
