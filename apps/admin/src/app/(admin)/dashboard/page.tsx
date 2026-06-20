'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { StatusBadge, orderStatusConfig, tradeStatusConfig, Spinner } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import {
  UsersIcon,
  ShoppingBagIcon,
  CurrencyDollarIcon,
  ArrowsRightLeftIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { colors as dsColors } from '@tarodan/ui';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface DashboardStats {
  totalUsers: number;
  usersChange: number;
  totalProducts: number;
  activeProducts: number;
  productsChange: number;
  totalOrders: number;
  ordersChange: number;
  totalRevenue: number;
  revenueChange: number;
  totalCommission: number;
  commissionChange: number;
  pendingApprovals: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  productTitle: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface PendingActions {
  pendingProducts: number;
  refundRequests: number;
  pendingMessages?: number;
  identityVerificationRequests?: number;
  totalPending: number;
}

interface RecentTrade {
  id: string;
  status: string;
  createdAt: string;
  initiator?: { id: string; displayName?: string | null; email?: string | null };
  receiver?: { id: string; displayName?: string | null; email?: string | null };
  items?: Array<{
    side: string;
    product?: { id: string; title?: string | null };
  }>;
}

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, change, icon: Icon, color }: StatCardProps) {
  return (
    <div className="admin-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted truncate">{title}</p>
          <p className="text-2xl font-bold text-heading mt-1 truncate">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-2 flex-wrap">
              {change >= 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4 text-success-700 mr-1 shrink-0" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 text-danger-600 mr-1 shrink-0" />
              )}
              <span className={change >= 0 ? 'text-success-700' : 'text-danger-600'}>
                {Math.abs(change)}%
              </span>
              <span className="text-muted ml-1 text-sm whitespace-nowrap">vs dün</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg shrink-0 ${color}`}>
          <Icon className="h-6 w-6 text-heading" />
        </div>
      </div>
    </div>
  );
}

interface AnalyticsData {
  salesByDay: number[];
  ordersByDay: number[];
  tradesByDay: number[];
  categoryDistribution: { name: string; count: number }[];
}

const chartPalette = {
  primary: dsColors.primary[500]!,
  primaryLight: dsColors.primary[100]!,
  info: dsColors.info[500]!,
  infoLight: dsColors.info[100]!,
  success: dsColors.success[500]!,
  warning: dsColors.warning[500]!,
  danger: dsColors.danger[500]!,
  subtle: dsColors.text.subtle,
  grid: 'rgba(255,255,255,0.1)',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingActions | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    salesByDay: [0, 0, 0, 0, 0, 0, 0],
    ordersByDay: [0, 0, 0, 0, 0, 0, 0],
    tradesByDay: [0, 0, 0, 0, 0, 0, 0],
    categoryDistribution: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      // Load all dashboard data in parallel
      const [dashboardRes, ordersRes, pendingRes, salesRes, tradesRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getRecentOrders(5),
        adminApi.getPendingActions(),
        adminApi.getSalesAnalytics({ groupBy: 'day' }).catch(() => null),
        adminApi.getTrades({ limit: 5, sort: 'createdAt:desc' }).catch(() => null),
      ]);

      const data = dashboardRes.data.data || dashboardRes.data;
      const revenueTotal = data.revenue?.total ?? data.commission?.total ?? 0;

      // Kategori dağılımı: dashboard API'den (tüm ürünlere göre)
      const dashboardCategoryDist = data.categoryDistribution;
      if (Array.isArray(dashboardCategoryDist) && dashboardCategoryDist.length > 0) {
        setAnalyticsData(prev => ({
          ...prev,
          categoryDistribution: dashboardCategoryDist.map((c: { name: string; count: number }) => ({
            name: c.name || 'Kategorisiz',
            count: typeof c.count === 'number' ? c.count : 0,
          })),
        }));
      }
      const usersTotal = data.users?.total || 0;
      const ordersTotal = data.orders?.total || 0;
      const productsActive = data.products?.active || 0;
      setStats({
        totalUsers: usersTotal,
        usersChange: data.users?.changePercent ?? (data.users?.new7d ? Math.round((data.users.new7d / Math.max(1, usersTotal)) * 100) : 0),
        totalProducts: data.products?.total || 0,
        activeProducts: productsActive,
        productsChange: data.products?.changePercent ?? 0,
        totalOrders: ordersTotal,
        ordersChange: data.orders?.changePercent ?? (data.orders?.last7d ? Math.round((data.orders.last7d / Math.max(1, ordersTotal)) * 100) : 0),
        totalRevenue: revenueTotal,
        revenueChange: data.revenue?.changePercent ?? data.commission?.changePercent ?? 0,
        totalCommission: revenueTotal,
        commissionChange: data.commission?.changePercent ?? 0,
        pendingApprovals: data.products?.pending || 0,
      });

      // Set recent orders
      const ordersData = ordersRes.data.data || ordersRes.data || [];
      setRecentOrders(Array.isArray(ordersData) ? ordersData : []);

      // Set recent trades
      if (tradesRes?.data) {
        const tradesData = tradesRes.data.data || tradesRes.data || [];
        setRecentTrades(Array.isArray(tradesData) ? tradesData : []);
      }

      // Set pending actions (API may return pendingMessages instead of identityVerificationRequests)
      const pendingData = pendingRes.data.data || pendingRes.data;
      setPendingActions(pendingData ? {
        ...pendingData,
        identityVerificationRequests: pendingData.identityVerificationRequests ?? 0,
      } : null);

      // Set analytics data from API - getSalesAnalytics returns { data: [{ date, totalSales, orderCount }], summary }
      if (salesRes?.data) {
        const salesData = salesRes.data.data ?? salesRes.data;
        const dailyArray = Array.isArray(salesData) ? salesData : salesData?.data ?? [];
        const dayMap = new Map<string, { sales: number; orders: number }>();
        dailyArray.forEach((d: any) => {
          const key = typeof d.date === 'string' ? d.date.slice(0, 10) : d.date;
          if (key) dayMap.set(key, { sales: Number(d.totalSales ?? d.amount ?? 0), orders: Number(d.orderCount ?? d.orders ?? 0) });
        });
        const salesByDay = Array.from({ length: 30 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (29 - i));
          const key = d.toISOString().split('T')[0];
          return dayMap.get(key)?.sales ?? 0;
        });
        const ordersByDay = Array.from({ length: 30 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (29 - i));
          const key = d.toISOString().split('T')[0];
          return dayMap.get(key)?.orders ?? 0;
        });
        setAnalyticsData(prev => ({
          ...prev,
          salesByDay,
          ordersByDay,
          categoryDistribution: (salesData && !Array.isArray(salesData)) ? (salesData.categoryDistribution ?? salesData.categories ?? prev.categoryDistribution) : prev.categoryDistribution,
        }));
      }

    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Dashboard load error:', error);
      // Fallback to zeros if API fails
      setStats({
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
      });
      setRecentOrders([]);
      setPendingActions({ pendingProducts: 0, refundRequests: 0, pendingMessages: 0, identityVerificationRequests: 0, totalPending: 0 });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} saat önce`;
    return date.toLocaleDateString('tr-TR');
  };

  // Extended order config with refund_requested (not in the shared config)
  const dashboardOrderStatusConfig: Record<string, StatusConfig> = {
    ...orderStatusConfig,
    refund_requested: { label: 'İade Talebi', variant: 'warning' },
  };

  // Extended trade config with in_progress (not in the shared config)
  const dashboardTradeStatusConfig: Record<string, StatusConfig> = {
    ...tradeStatusConfig,
    in_progress: { label: 'Devam Ediyor', variant: 'info' },
  };

  // Generate 30 day labels
  const generate30DayLabels = () => {
    const labels = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      labels.push(date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
    }
    return labels;
  };

  // Chart data - 30 day sales performance
  const salesChartData = {
    labels: generate30DayLabels(),
    datasets: [
      {
        label: 'Satışlar (₺)',
        data: analyticsData.salesByDay.length === 30 ? analyticsData.salesByDay : Array(30).fill(0).map(() => Math.floor(Math.random() * 15000) + 5000),
        borderColor: chartPalette.primary,
        backgroundColor: chartPalette.primaryLight,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const ordersChartData = {
    labels: generate30DayLabels(),
    datasets: [
      {
        label: 'Siparişler',
        data: analyticsData.ordersByDay.length === 30 ? analyticsData.ordersByDay : Array(30).fill(0).map(() => Math.floor(Math.random() * 50) + 10),
        backgroundColor: chartPalette.info,
        borderRadius: 4,
      },
    ],
  };

  // Kategoriler çoktan aza sıralı (backend’den zaten geliyor; frontend’de de garanti et)
  const sortedCategories = [...(analyticsData.categoryDistribution || [])].sort((a, b) => b.count - a.count);

  // Her kategori için farklı renk (geniş palet)
  const categoryColors = [
    dsColors.primary[500]!,
    dsColors.info[500]!,
    dsColors.success[500]!,
    dsColors.warning[500]!,
    dsColors.danger[500]!,
    dsColors.primary[700]!,
    dsColors.info[700]!,
    dsColors.success[700]!,
    dsColors.warning[700]!,
    dsColors.danger[700]!,
  ];

  const categoryChartData = {
    labels: sortedCategories.length > 0
      ? sortedCategories.map(c => c.name)
      : ['Veri Yok'],
    datasets: [
      {
        data: sortedCategories.length > 0
          ? sortedCategories.map(c => c.count)
          : [1],
        backgroundColor: sortedCategories.length > 0
          ? sortedCategories.map((_, i) => categoryColors[i % categoryColors.length])
          : [chartPalette.subtle],
        borderWidth: 0,
      },
    ],
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-heading">Dashboard</h1>
          <p className="text-muted mt-1">Hoş geldiniz! İşte bugünkü genel bakış.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Toplam Satış"
            value={stats?.totalOrders.toLocaleString() || 0}
            change={stats?.ordersChange}
            icon={ShoppingBagIcon}
            color="bg-info-500"
          />
          <StatCard
            title="Komisyon Geliri"
            value={`₺${stats?.totalCommission.toLocaleString() || 0}`}
            change={stats?.commissionChange}
            icon={CurrencyDollarIcon}
            color="bg-success-500"
          />
          <StatCard
            title="Aktif Ürünler"
            value={stats?.activeProducts.toLocaleString() || 0}
            change={stats?.productsChange}
            icon={ChartBarIcon}
            color="bg-primary-500"
          />
          <StatCard
            title="Toplam Kullanıcı"
            value={stats?.totalUsers.toLocaleString() || 0}
            change={stats?.usersChange}
            icon={UsersIcon}
            color="bg-primary-500"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link href="/products" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg shrink-0">
              <ShoppingBagIcon className="h-6 w-6 text-primary-600" />
            </div>
            <span className="font-medium text-heading min-w-0 truncate">Ürünler</span>
          </Link>
          <Link href="/orders" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-info-500/20 rounded-lg shrink-0">
              <ChartBarIcon className="h-6 w-6 text-info-500" />
            </div>
            <span className="font-medium text-heading min-w-0 truncate">Siparişler</span>
          </Link>
          <Link href="/users" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg shrink-0">
              <UsersIcon className="h-6 w-6 text-primary-500" />
            </div>
            <span className="font-medium text-heading min-w-0 truncate">Kullanıcılar</span>
          </Link>
          <Link href="/messages" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-success-500/20 rounded-lg shrink-0">
              <ArrowsRightLeftIcon className="h-6 w-6 text-success-500" />
            </div>
            <span className="font-medium text-heading min-w-0 truncate">Mesajlar</span>
          </Link>
        </div>

        {/* Pending Actions Panel */}
        {pendingActions && pendingActions.totalPending > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pendingActions.pendingProducts > 0 && (
              <div className="bg-warning-900/20 border border-warning-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-warning-500/20 rounded-lg mr-4 shrink-0">
                  <ShoppingBagIcon className="h-6 w-6 text-warning-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-warning-700 font-medium">
                    {pendingActions.pendingProducts} ürün onay bekliyor
                  </p>
                  <Link href="/products?status=pending" className="text-sm text-warning-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {pendingActions.refundRequests > 0 && (
              <div className="bg-primary-900/20 border border-primary-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-primary-500/20 rounded-lg mr-4 shrink-0">
                  <CurrencyDollarIcon className="h-6 w-6 text-primary-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-primary-700 font-medium">
                    {pendingActions.refundRequests} iade talebi
                  </p>
                  <Link href="/orders?status=refund_requested" className="text-sm text-primary-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {(pendingActions.pendingMessages ?? 0) > 0 && (
              <div className="bg-info-900/20 border border-info-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-info-500/20 rounded-lg mr-4 shrink-0">
                  <ArrowsRightLeftIcon className="h-6 w-6 text-info-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-info-700 font-medium">
                    {pendingActions.pendingMessages} mesaj onay bekliyor
                  </p>
                  <Link href="/messages" className="text-sm text-info-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {(pendingActions.identityVerificationRequests ?? 0) > 0 && (
              <div className="bg-info-900/20 border border-info-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-info-500/20 rounded-lg mr-4 shrink-0">
                  <UsersIcon className="h-6 w-6 text-info-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-info-700 font-medium">
                    {pendingActions.identityVerificationRequests} kimlik doğrulama talebi
                  </p>
                  <Link href="/users?status=pending_verification" className="text-sm text-info-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Chart */}
          <div className="admin-card">
            <h3 className="text-lg font-semibold text-heading mb-4">Son 30 Gün Satış Performansı</h3>
            <Line
              data={salesChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  x: {
                    grid: { color: chartPalette.grid },
                    ticks: { color: chartPalette.subtle },
                  },
                  y: {
                    grid: { color: chartPalette.grid },
                    ticks: { color: chartPalette.subtle },
                  },
                },
              }}
            />
          </div>

          {/* Orders Chart */}
          <div className="admin-card">
            <h3 className="text-lg font-semibold text-heading mb-4">Günlük Sipariş Sayısı</h3>
            <Bar
              data={ordersChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    labels: { color: chartPalette.subtle },
                  },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: chartPalette.subtle },
                  },
                  y: {
                    grid: { color: chartPalette.grid },
                    ticks: { color: chartPalette.subtle },
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category Distribution */}
          <div className="admin-card overflow-visible">
            <h3 className="text-lg font-semibold text-heading mb-4">Kategori Dağılımı</h3>
            <div className="min-h-[380px] pb-6">
              <Doughnut
                data={categoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: { padding: { bottom: 20 } },
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        padding: 12,
                        boxWidth: 14,
                        font: { size: 12 },
                        generateLabels: (chart: ChartJS) => {
                          const ds = chart.data.datasets[0];
                          const bg = (ds?.backgroundColor ?? []) as string[];
                          return (chart.data.labels ?? []).map((label, i) => ({
                            text: String(label ?? ''),
                            fillStyle: bg[i] ?? chartPalette.subtle,
                            fontColor: bg[i] ?? chartPalette.subtle,
                            index: i,
                          }));
                        },
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Recent Orders Panel */}
          <div className="admin-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-heading">Son Siparişler</h3>
              <Link href="/orders" className="text-sm text-primary-600 hover:underline">
                Tümünü Gör →
              </Link>
            </div>
            <div className="space-y-3">
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3 flex-shrink-0">
                        <span className="text-primary-600 text-sm font-medium">
                          {order.buyerName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-heading truncate">
                          <span className="font-medium">{order.orderNumber}</span>
                        </p>
                        <p className="text-xs text-muted truncate">
                          {order.buyerName} - {order.productTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="text-sm font-semibold text-heading whitespace-nowrap">
                        ₺{order.amount.toLocaleString('tr-TR')}
                      </span>
                      <StatusBadge status={order.status} config={dashboardOrderStatusConfig} />
                      <span className="text-xs text-muted whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted">
                  Henüz sipariş bulunmuyor
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Trades Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Trades Panel */}
          <div className="admin-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-heading flex items-center gap-2">
                <ArrowsRightLeftIcon className="h-5 w-5 text-primary-600" />
                Son Takaslar
              </h3>
              <Link href="/trades" className="text-sm text-primary-600 hover:underline">
                Tümünü Gör →
              </Link>
            </div>
            <div className="space-y-3">
              {recentTrades.length > 0 ? (
                recentTrades.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-success-500/20 flex items-center justify-center mr-3 flex-shrink-0">
                        <ArrowsRightLeftIcon className="h-5 w-5 text-success-700" />
                      </div>
                      <div className="min-w-0">
                        {(() => {
                          const initiatorName = trade.initiator?.displayName || trade.initiator?.email || 'Kullanıcı';
                          const receiverName = trade.receiver?.displayName || trade.receiver?.email || 'Kullanıcı';
                          const initiatorItems = (trade.items || []).filter(i => i.side === 'initiator');
                          const receiverItems = (trade.items || []).filter(i => i.side === 'receiver');
                          const offeredTitle = initiatorItems[0]?.product?.title;
                          const requestedTitle = receiverItems[0]?.product?.title;
                          const offeredLabel = offeredTitle
                            ? offeredTitle + (initiatorItems.length > 1 ? ` (+${initiatorItems.length - 1})` : '')
                            : '—';
                          const requestedLabel = requestedTitle
                            ? requestedTitle + (receiverItems.length > 1 ? ` (+${receiverItems.length - 1})` : '')
                            : '—';
                          return (
                            <>
                              <p className="text-sm text-heading truncate">
                                <span className="font-medium">{initiatorName}</span>
                                <span className="text-muted mx-2">→</span>
                                <span className="font-medium">{receiverName}</span>
                              </p>
                              <p className="text-xs text-muted truncate">
                                {offeredLabel} → {requestedLabel}
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <StatusBadge status={trade.status} config={dashboardTradeStatusConfig} />
                      <span className="text-xs text-muted whitespace-nowrap">
                        {formatDate(trade.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted">
                  Henüz takas bulunmuyor
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}
