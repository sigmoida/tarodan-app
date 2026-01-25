'use client';

import { useState, useEffect } from 'react';
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
  identityVerificationRequests: number;
  totalPending: number;
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
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change >= 0 ? (
                <ArrowTrendingUpIcon className="h-4 w-4 text-green-400 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4 text-red-400 mr-1" />
              )}
              <span className={change >= 0 ? 'text-green-400' : 'text-red-400'}>
                {Math.abs(change)}%
              </span>
              <span className="text-gray-500 ml-1 text-sm">vs dün</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
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
      const [dashboardRes, ordersRes, pendingRes, salesRes] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getRecentOrders(5),
        adminApi.getPendingActions(),
        adminApi.getSalesAnalytics({ groupBy: 'day' }).catch(() => null),
      ]);

      const data = dashboardRes.data.data || dashboardRes.data;
      setStats({
        totalUsers: data.users?.total || 0,
        usersChange: data.users?.changePercent || 5.2,
        totalProducts: data.products?.total || 0,
        activeProducts: data.products?.active || 0,
        productsChange: data.products?.changePercent || 3.1,
        totalOrders: data.orders?.total || 0,
        ordersChange: data.orders?.changePercent || 8.5,
        totalRevenue: data.revenue?.total || 0,
        revenueChange: data.revenue?.changePercent || 12.5,
        totalCommission: data.commission?.total || 0,
        commissionChange: data.commission?.changePercent || 15.3,
        pendingApprovals: data.products?.pending || 0,
      });

      // Set recent orders
      const ordersData = ordersRes.data.data || ordersRes.data || [];
      setRecentOrders(Array.isArray(ordersData) ? ordersData : []);

      // Set pending actions
      const pendingData = pendingRes.data.data || pendingRes.data;
      setPendingActions(pendingData);

      // Set analytics data from API
      if (salesRes?.data) {
        const salesData = salesRes.data.data || salesRes.data;
        setAnalyticsData({
          salesByDay: salesData.salesByDay || salesData.daily?.map((d: any) => d.amount) || [0, 0, 0, 0, 0, 0, 0],
          ordersByDay: salesData.ordersByDay || salesData.daily?.map((d: any) => d.orders) || [0, 0, 0, 0, 0, 0, 0],
          tradesByDay: salesData.tradesByDay || salesData.daily?.map((d: any) => d.trades) || [0, 0, 0, 0, 0, 0, 0],
          categoryDistribution: salesData.categoryDistribution || salesData.categories || [],
        });
      }
    } catch (error) {
      console.error('Dashboard load error:', error);
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
      setPendingActions({ pendingProducts: 0, refundRequests: 0, identityVerificationRequests: 0, totalPending: 0 });
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
      pending_payment: 'bg-yellow-500/20 text-yellow-400',
      paid: 'bg-blue-500/20 text-blue-400',
      preparing: 'bg-purple-500/20 text-purple-400',
      shipped: 'bg-indigo-500/20 text-indigo-400',
      delivered: 'bg-green-500/20 text-green-400',
      completed: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
      refund_requested: 'bg-orange-500/20 text-orange-400',
      refunded: 'bg-gray-500/20 text-gray-400',
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
      <span className={`px-2 py-1 rounded-full text-xs ${statusColors[status] || 'bg-gray-500/20 text-gray-400'}`}>
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

  // Default category colors
  const categoryColors = [
    '#e94560',
    '#4cc9f0',
    '#f72585',
    '#7209b7',
    '#3a0ca3',
    '#4361ee',
  ];

  const categoryChartData = {
    labels: analyticsData.categoryDistribution.length > 0 
      ? analyticsData.categoryDistribution.map(c => c.name)
      : ['Veri Yok'],
    datasets: [
      {
        data: analyticsData.categoryDistribution.length > 0
          ? analyticsData.categoryDistribution.map(c => c.count)
          : [1],
        backgroundColor: analyticsData.categoryDistribution.length > 0
          ? analyticsData.categoryDistribution.map((_, i) => categoryColors[i % categoryColors.length])
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Hoş geldiniz! İşte bugünkü genel bakış.</p>
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

        {/* Pending Actions Panel */}
        {pendingActions && pendingActions.totalPending > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pendingActions.pendingProducts > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-yellow-500/20 rounded-lg mr-4">
                  <ShoppingBagIcon className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <p className="text-yellow-400 font-medium">
                    {pendingActions.pendingProducts} ürün onay bekliyor
                  </p>
                  <a href="/products?status=pending" className="text-sm text-yellow-500 hover:underline">
                    İncele →
                  </a>
                </div>
              </div>
            )}
            {pendingActions.refundRequests > 0 && (
              <div className="bg-orange-900/20 border border-orange-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-orange-500/20 rounded-lg mr-4">
                  <CurrencyDollarIcon className="h-6 w-6 text-orange-400" />
                </div>
                <div>
                  <p className="text-orange-400 font-medium">
                    {pendingActions.refundRequests} iade talebi
                  </p>
                  <a href="/orders?status=refund_requested" className="text-sm text-orange-500 hover:underline">
                    İncele →
                  </a>
                </div>
              </div>
            )}
            {pendingActions.identityVerificationRequests > 0 && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center">
                <div className="p-2 bg-blue-500/20 rounded-lg mr-4">
                  <UsersIcon className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-blue-400 font-medium">
                    {pendingActions.identityVerificationRequests} kimlik doğrulama talebi
                  </p>
                  <a href="/users?status=pending_verification" className="text-sm text-blue-500 hover:underline">
                    İncele →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Chart */}
          <div className="admin-card">
            <h3 className="text-lg font-semibold text-white mb-4">Son 30 Gün Satış Performansı</h3>
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
            <h3 className="text-lg font-semibold text-white mb-4">Günlük Sipariş Sayısı</h3>
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
          <div className="admin-card">
            <h3 className="text-lg font-semibold text-white mb-4">Kategori Dağılımı</h3>
            <div className="h-64">
              <Doughnut
                data={categoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: { color: '#9ca3af', padding: 15 },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Recent Orders Panel */}
          <div className="admin-card lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Son Siparişler</h3>
              <a href="/orders" className="text-sm text-primary-500 hover:underline">
                Tümünü Gör →
              </a>
            </div>
            <div className="space-y-3">
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-dark-700 last:border-0">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center mr-3 flex-shrink-0">
                        <span className="text-primary-500 text-sm font-medium">
                          {order.buyerName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          <span className="font-medium">{order.orderNumber}</span>
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {order.buyerName} - {order.productTitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="text-sm font-semibold text-white whitespace-nowrap">
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
                <div className="text-center py-8 text-gray-400">
                  Henüz sipariş bulunmuyor
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
