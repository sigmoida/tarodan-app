'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { adminApi } from '@/lib/api';
import {
  type DashboardData,
  type DashboardStats,
  type PendingActions,
} from './types';

type T = ReturnType<typeof useTranslations<never>>;

const EMPTY_STATS: DashboardStats = {
  totalUsers: 0,
  usersChange: 0,
  totalProducts: 0,
  activeProducts: 0,
  productsChange: 0,
  totalOrders: 0,
  ordersChange: 0,
  totalRevenue: 0,
  revenueChange: 0,
  totalCommission: 0,
  commissionChange: 0,
  pendingApprovals: 0,
};

/** Build a 30-entry series (oldest→newest) from a date→value map. */
function last30Days(dayMap: Map<string, number>) {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return dayMap.get(d.toISOString().split('T')[0]) ?? 0;
  });
}

async function fetchDashboard(t: T): Promise<DashboardData> {
  const [dashboardRes, ordersRes, pendingRes, salesRes, tradesRes] = await Promise.all([
    adminApi.getDashboard(),
    adminApi.getRecentOrders(5),
    adminApi.getPendingActions(),
    adminApi.getSalesAnalytics({ groupBy: 'day' }).catch(() => null),
    adminApi.getTrades({ limit: 5, sort: 'createdAt:desc' }).catch(() => null),
  ]);

  const data = dashboardRes.data.data || dashboardRes.data;
  const revenueTotal = data.revenue?.total ?? data.commission?.total ?? 0;
  const usersTotal = data.users?.total || 0;
  const ordersTotal = data.orders?.total || 0;

  const stats: DashboardStats = {
    totalUsers: usersTotal,
    usersChange:
      data.users?.changePercent ??
      (data.users?.new7d ? Math.round((data.users.new7d / Math.max(1, usersTotal)) * 100) : 0),
    totalProducts: data.products?.total || 0,
    activeProducts: data.products?.active || 0,
    productsChange: data.products?.changePercent ?? 0,
    totalOrders: ordersTotal,
    ordersChange:
      data.orders?.changePercent ??
      (data.orders?.last7d ? Math.round((data.orders.last7d / Math.max(1, ordersTotal)) * 100) : 0),
    totalRevenue: revenueTotal,
    revenueChange: data.revenue?.changePercent ?? data.commission?.changePercent ?? 0,
    totalCommission: revenueTotal,
    commissionChange: data.commission?.changePercent ?? 0,
    pendingApprovals: data.products?.pending || 0,
  };

  const ordersData = ordersRes.data.data || ordersRes.data || [];
  const recentOrders = Array.isArray(ordersData) ? ordersData : [];

  const tradesData = tradesRes?.data?.data || tradesRes?.data || [];
  const recentTrades = Array.isArray(tradesData) ? tradesData : [];

  const pendingData = pendingRes.data.data || pendingRes.data;
  const pendingActions: PendingActions | null = pendingData
    ? {
        ...pendingData,
        identityVerificationRequests: pendingData.identityVerificationRequests ?? 0,
      }
    : null;

  // ── Analytics (30-day series + category distribution) ──────────────────────
  let categoryDistribution: { name: string; count: number }[] = Array.isArray(
    data.categoryDistribution,
  )
    ? data.categoryDistribution.map((c: { name: string; count: number }) => ({
        name: c.name || t('admin.dashboard.charts.uncategorized'),
        count: typeof c.count === 'number' ? c.count : 0,
      }))
    : [];

  let salesByDay = Array(30).fill(0);
  let ordersByDay = Array(30).fill(0);

  if (salesRes?.data) {
    const salesData = salesRes.data.data ?? salesRes.data;
    const dailyArray = Array.isArray(salesData) ? salesData : (salesData?.data ?? []);
    const salesMap = new Map<string, number>();
    const ordersMap = new Map<string, number>();
    dailyArray.forEach((d: any) => {
      const key = typeof d.date === 'string' ? d.date.slice(0, 10) : d.date;
      if (key) {
        salesMap.set(key, Number(d.totalSales ?? d.amount ?? 0));
        ordersMap.set(key, Number(d.orderCount ?? d.orders ?? 0));
      }
    });
    salesByDay = last30Days(salesMap);
    ordersByDay = last30Days(ordersMap);
    if (salesData && !Array.isArray(salesData)) {
      categoryDistribution =
        salesData.categoryDistribution ?? salesData.categories ?? categoryDistribution;
    }
  }

  return {
    stats,
    recentOrders,
    recentTrades,
    pendingActions,
    analytics: { salesByDay, ordersByDay, categoryDistribution },
  };
}

/** Loads all dashboard data (stats, recent orders/trades, pending, analytics). */
export function useDashboard() {
  const t = useTranslations();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetchDashboard(t),
  });
  return {
    data: query.data,
    loading: query.isLoading,
    stats: query.data?.stats ?? EMPTY_STATS,
  };
}
