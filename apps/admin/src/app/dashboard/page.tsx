'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
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
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
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
  offeredBy?: { username: string };
  requestedBy?: { username: string };
  offeredProduct?: { title: string };
  requestedProduct?: { title: string };
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change >= 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4 text-green-700 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 text-red-600 mr-1" />
              )}
              <span className={change >= 0 ? 'text-green-700' : 'text-red-600'}>
                {Math.abs(change)}%
              </span>
              <span className="text-gray-500 ml-1 text-sm">vs dün</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-gray-900" />
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

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending_payment: 'bg-yellow-500/20 text-yellow-700',
      paid: 'bg-blue-500/20 text-blue-700',
      preparing: 'bg-purple-500/20 text-purple-700',
      shipped: 'bg-indigo-500/20 text-indigo-700',
      delivered: 'bg-green-500/20 text-green-700',
      completed: 'bg-green-500/20 text-green-700',
      cancelled: 'bg-red-500/20 text-red-600',
      refund_requested: 'bg-orange-500/20 text-orange-700',
      refunded: 'bg-gray-500/20 text-gray-500',
    };
    const statusLabels: Record<string, string> = {
      pending_payment: 'Ödeme Bekliyor',
      paid: 'Ödendi',
      preparing: 'Hazırlanıyor',
      shipped: 'Kargoda',
      delivered: 'Teslim Edildi',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
      refund_requested: 'İade Talebi',
      refunded: 'İade Edildi',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${statusColors[status] || 'bg-gray-500/20 text-gray-500'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const getTradeStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-700',
      accepted: 'bg-blue-500/20 text-blue-700',
      in_progress: 'bg-purple-500/20 text-purple-700',
      completed: 'bg-green-500/20 text-green-700',
      cancelled: 'bg-red-500/20 text-red-600',
      rejected: 'bg-red-500/20 text-red-600',
      disputed: 'bg-orange-500/20 text-orange-700',
    };
    const statusLabels: Record<string, string> = {
      pending: 'Bekliyor',
      accepted: 'Kabul Edildi',
      in_progress: 'Devam Ediyor',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
      rejected: 'Reddedildi',
      disputed: 'İtirazlı',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${statusColors[status] || 'bg-gray-500/20 text-gray-500'}`}>
        {statusLabels[status] || status}
      </span>
    );
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
        borderColor: '#e94560',
        backgroundColor: 'rgba(233, 69, 96, 0.1)',
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
        backgroundColor: '#e94560',
        borderRadius: 4,
      },
    ],
  };

  // Kategoriler çoktan aza sıralı (backend’den zaten geliyor; frontend’de de garanti et)
  const sortedCategories = [...(analyticsData.categoryDistribution || [])].sort((a, b) => b.count - a.count);

  // Her kategori için farklı renk (geniş palet)
  const categoryColors = [
    '#e94560', '#4cc9f0', '#f72585', '#7209b7', '#3a0ca3', '#4361ee',
    '#06d6a0', '#ef476f', '#ffd166', '#118ab2', '#073b4c', '#9d4edd',
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9',
    '#fd79a8', '#a29bfe', '#6c5ce7', '#00b894', '#e17055', '#fab1a0',
    '#74b9ff', '#81ecec', '#55efc4', '#ffeaa7', '#dfe6e9', '#b2bec3',
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
          : ['#6b7280'],
        borderWidth: 0,
      },
    ],
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Hoş geldiniz! İşte bugünkü genel bakış.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Toplam Satış"
            value={stats?.totalOrders.toLocaleString() || 0}
            change={stats?.ordersChange}
            icon={ShoppingBagIcon}
            color="bg-blue-500"
          />
          <StatCard
            title="Komisyon Geliri"
            value={`₺${stats?.totalCommission.toLocaleString() || 0}`}
            change={stats?.commissionChange}
            icon={CurrencyDollarIcon}
            color="bg-green-500"
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
            color="bg-purple-500"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link href="/products" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <ShoppingBagIcon className="h-6 w-6 text-primary-600" />
            </div>
            <span className="font-medium text-gray-900">Ürünler</span>
          </Link>
          <Link href="/orders" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-500" />
            </div>
            <span className="font-medium text-gray-900">Siparişler</span>
          </Link>
          <Link href="/users" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <UsersIcon className="h-6 w-6 text-purple-500" />
            </div>
            <span className="font-medium text-gray-900">Kullanıcılar</span>
          </Link>
          <Link href="/messages" className="admin-card hover:border-primary-500/50 transition-colors flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <ArrowsRightLeftIcon className="h-6 w-6 text-green-500" />
            </div>
            <span className="font-medium text-gray-900">Mesajlar</span>
          </Link>
        </div>

        {/* Pending Actions Panel */}
        {pendingActions && pendingActions.totalPending > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pendingActions.pendingProducts > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-yellow-500/20 rounded-lg mr-4">
                  <ShoppingBagIcon className="h-6 w-6 text-yellow-700" />
                </div>
                <div>
                  <p className="text-yellow-700 font-medium">
                    {pendingActions.pendingProducts} ürün onay bekliyor
                  </p>
                  <Link href="/products?status=pending" className="text-sm text-yellow-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {pendingActions.refundRequests > 0 && (
              <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-orange-500/20 rounded-lg mr-4">
                  <CurrencyDollarIcon className="h-6 w-6 text-orange-700" />
                </div>
                <div>
                  <p className="text-orange-700 font-medium">
                    {pendingActions.refundRequests} iade talebi
                  </p>
                  <Link href="/orders?status=refund_requested" className="text-sm text-orange-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {(pendingActions.pendingMessages ?? 0) > 0 && (
              <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-indigo-500/20 rounded-lg mr-4">
                  <ArrowsRightLeftIcon className="h-6 w-6 text-indigo-700" />
                </div>
                <div>
                  <p className="text-indigo-700 font-medium">
                    {pendingActions.pendingMessages} mesaj onay bekliyor
                  </p>
                  <Link href="/messages" className="text-sm text-indigo-500 hover:underline">
                    İncele →
                  </Link>
                </div>
              </div>
            )}
            {(pendingActions.identityVerificationRequests ?? 0) > 0 && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-blue-500/20 rounded-lg mr-4">
                  <UsersIcon className="h-6 w-6 text-blue-700" />
                </div>
                <div>
                  <p className="text-blue-700 font-medium">
                    {pendingActions.identityVerificationRequests} kimlik doğrulama talebi
                  </p>
                  <Link href="/users?status=pending_verification" className="text-sm text-blue-500 hover:underline">
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Son 30 Gün Satış Performansı</h3>
            <Line
              data={salesChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                },
                scales: {
                  x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#9ca3af' },
                  },
                  y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#9ca3af' },
                  },
                },
              }}
            />
          </div>

          {/* Orders Chart */}
          <div className="admin-card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Günlük Sipariş Sayısı</h3>
            <Bar
              data={ordersChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    labels: { color: '#9ca3af' },
                  },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af' },
                  },
                  y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#9ca3af' },
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Kategori Dağılımı</h3>
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
                            fillStyle: bg[i] ?? '#6b7280',
                            fontColor: bg[i] ?? '#9ca3af',
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
              <h3 className="text-lg font-semibold text-gray-900">Son Siparişler</h3>
              <Link href="/orders" className="text-sm text-primary-600 hover:underline">
                Tümünü Gör →
              </Link>
            </div>
            <div className="space-y-3">
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3 flex-shrink-0">
                        <span className="text-primary-600 text-sm font-medium">
                          {order.buyerName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          <span className="font-medium">{order.orderNumber}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {order.buyerName} - {order.productTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                        ₺{order.amount.toLocaleString('tr-TR')}
                      </span>
                      {getStatusBadge(order.status)}
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
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
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
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
                  <div key={trade.id} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mr-3 flex-shrink-0">
                        <ArrowsRightLeftIcon className="h-5 w-5 text-green-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">
                          <span className="font-medium">{trade.offeredBy?.username || 'Kullanıcı'}</span>
                          <span className="text-gray-500 mx-2">↔</span>
                          <span className="font-medium">{trade.requestedBy?.username || 'Kullanıcı'}</span>
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {trade.offeredProduct?.title || 'Ürün'} ↔ {trade.requestedProduct?.title || 'Ürün'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      {getTradeStatusBadge(trade.status)}
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(trade.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Henüz takas bulunmuyor
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
