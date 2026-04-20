'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UsersIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
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
import { Spinner } from '@tarodan/ui';

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
  Filler
);

interface AnalyticsData {
  salesReport: any;
  userReport: any;
  productReport: any;
  tradeReport: any;
}

type DateRange = '7d' | '30d' | '90d' | '1y';

const ORDER_STATUS_LABELS: Record<string, string> = {
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

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [activeTab, setActiveTab] = useState<'sales' | 'users' | 'products' | 'trades'>('sales');
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const getDateRangeParams = () => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (dateRange) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  };

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const params = { ...getDateRangeParams(), groupBy: 'day' as const };

      const [salesRes, revenueRes, userRes, productRes, tradeRes] = await Promise.all([
        adminApi.getSalesAnalytics(params).catch((e) => {
          if (process.env.NODE_ENV === 'development') console.error('Sales analytics error:', e);
          return { data: null };
        }),
        adminApi.getRevenueAnalytics(params).catch(() => ({ data: null })),
        adminApi.getUserAnalytics(params).catch((e) => {
          if (process.env.NODE_ENV === 'development') console.error('User analytics error:', e);
          return { data: null };
        }),
        adminApi.getProductReport(params).catch(() => ({ data: null })),
        adminApi.getTradeReport(params).catch(() => ({ data: null })),
      ]);

      const salesData = salesRes?.data?.data ?? salesRes?.data;
      const salesSummary = salesRes?.data?.summary ?? {};
      const revenueSummary = revenueRes?.data?.summary ?? {};
      const userData = userRes?.data?.data ?? userRes?.data;
      const userSummary = userRes?.data?.summary ?? {};

      const dailyArray = Array.isArray(salesData) ? salesData : salesData?.data ?? [];
      const dailyData = dailyArray.map((d: any) => ({
        date: typeof d.date === 'string' ? d.date : d.date?.slice(0, 10),
        orders: Number(d.orderCount ?? d.orders ?? 0),
        revenue: Number(d.totalSales ?? d.revenue ?? 0),
      }));

      const userGrowthArray = Array.isArray(userData) ? userData : userData?.data ?? [];
      const userGrowth = userGrowthArray.map((d: any) => ({
        month: typeof d.date === 'string' ? d.date.slice(5) : d.date?.slice(0, 7) ?? '',
        users: Number(d.newUsers ?? d.users ?? 0),
      }));

      setData({
        salesReport: {
          totalOrders: salesSummary.totalOrders ?? 0,
          totalRevenue: salesSummary.totalSales ?? 0,
          totalCommission: revenueSummary.totalCommission ?? 0,
          averageOrderValue: salesSummary.averageOrderValue ?? 0,
          ordersByStatus: salesSummary.ordersByStatus ?? {},
          dailyData: dailyData.length > 0 ? dailyData : generateMockDailyData(),
        },
        userReport: {
          totalUsers: userSummary.totalUsers ?? 0,
          newUsers: userSummary.totalNewUsers ?? 0,
          activeUsers: userSummary.averageDailyActiveUsers ?? 0,
          sellerCount: userSummary.totalNewSellers ?? 0,
          userGrowth: userGrowth.length > 0 ? userGrowth : generateMockGrowthData(),
        },
        productReport: productRes?.data ? normalizeProductReport(productRes.data) : {
          totalProducts: 0,
          activeProducts: 0,
          pendingProducts: 0,
          averagePrice: 0,
          categoryDistribution: generateMockCategoryData(),
        },
        tradeReport: tradeRes?.data ? normalizeTradeReport(tradeRes.data) : {
          totalTrades: 0,
          completedTrades: 0,
          pendingTrades: 0,
          disputedTrades: 0,
          averageTradeValue: 0,
        },
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load analytics:', error);
      setData({
        salesReport: {
          totalOrders: 0,
          totalRevenue: 0,
          totalCommission: 0,
          averageOrderValue: 0,
          ordersByStatus: {},
          dailyData: generateMockDailyData(),
        },
        userReport: {
          totalUsers: 0,
          newUsers: 0,
          activeUsers: 0,
          sellerCount: 0,
          userGrowth: generateMockGrowthData(),
        },
        productReport: {
          totalProducts: 0,
          activeProducts: 0,
          pendingProducts: 0,
          averagePrice: 0,
          categoryDistribution: generateMockCategoryData(),
        },
        tradeReport: {
          totalTrades: 0,
          completedTrades: 0,
          pendingTrades: 0,
          disputedTrades: 0,
          averageTradeValue: 0,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const normalizeProductReport = (raw: any) => ({
    totalProducts: raw.total ?? raw.totalProducts ?? 0,
    activeProducts: raw.active ?? raw.activeProducts ?? 0,
    pendingProducts: raw.pending ?? raw.pendingProducts ?? 0,
    averagePrice: raw.averagePrice ?? 0,
    categoryDistribution: raw.categoryDistribution ?? raw.categories ?? generateMockCategoryData(),
  });

  const normalizeTradeReport = (raw: any) => ({
    totalTrades: raw.total ?? raw.totalTrades ?? 0,
    completedTrades: raw.completedTrades ?? 0,
    pendingTrades: raw.pendingTrades ?? 0,
    disputedTrades: raw.disputedTrades ?? 0,
    averageTradeValue: raw.averageTradeValue ?? 0,
  });

  // Mock data generators
  const generateMockDailyData = () => {
    const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 365;
    return Array.from({ length: Math.min(days, 30) }, (_, i) => ({
      date: new Date(Date.now() - (days - i - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      orders: Math.floor(Math.random() * 50) + 10,
      revenue: Math.floor(Math.random() * 20000) + 5000,
    }));
  };

  const generateMockGrowthData = () => {
    return Array.from({ length: 12 }, (_, i) => ({
      month: new Date(Date.now() - (11 - i) * 30 * 24 * 60 * 60 * 1000).toLocaleString('tr-TR', { month: 'short' }),
      users: Math.floor(Math.random() * 500) + 100,
    }));
  };

  const generateMockCategoryData = () => [
    { name: 'Hot Wheels', count: 2345, percentage: 35 },
    { name: 'Matchbox', count: 1567, percentage: 23 },
    { name: 'Tomica', count: 987, percentage: 15 },
    { name: 'Majorette', count: 765, percentage: 11 },
    { name: 'Maisto', count: 543, percentage: 8 },
    { name: 'Diğer', count: 536, percentage: 8 },
  ];

  // Chart configurations
  const salesChartData = {
    labels: data?.salesReport.dailyData?.map((d: any) => d.date.slice(5)) || [],
    datasets: [
      {
        label: 'Satışlar (₺)',
        data: data?.salesReport.dailyData?.map((d: any) => d.revenue) || [],
        borderColor: '#e94560',
        backgroundColor: 'rgba(233, 69, 96, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const ordersChartData = {
    labels: data?.salesReport.dailyData?.map((d: any) => d.date.slice(5)) || [],
    datasets: [
      {
        label: 'Siparişler',
        data: data?.salesReport.dailyData?.map((d: any) => d.orders) || [],
        backgroundColor: '#4cc9f0',
        borderRadius: 4,
      },
    ],
  };

  const userGrowthData = {
    labels: data?.userReport.userGrowth?.map((d: any) => d.month) || [],
    datasets: [
      {
        label: 'Yeni Kullanıcılar',
        data: data?.userReport.userGrowth?.map((d: any) => d.users) || [],
        borderColor: '#4cc9f0',
        backgroundColor: 'rgba(76, 201, 240, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const categoryChartData = {
    labels: data?.productReport.categoryDistribution?.map((d: any) => d.name) || [],
    datasets: [
      {
        data: data?.productReport.categoryDistribution?.map((d: any) => d.percentage) || [],
        backgroundColor: [
          '#e94560',
          '#4cc9f0',
          '#f72585',
          '#7209b7',
          '#3a0ca3',
          '#4361ee',
        ],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analizler</h1>
            <p className="text-gray-500 mt-1">Detaylı satış, kullanıcı ve ürün analizleri</p>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2 bg-white rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-primary-500 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {range === '7d' ? '7 Gün' : range === '30d' ? '30 Gün' : range === '90d' ? '90 Gün' : '1 Yıl'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            {[
              { key: 'sales', label: 'Satış Analitiği', icon: CurrencyDollarIcon },
              { key: 'users', label: 'Kullanıcı Analitiği', icon: UsersIcon },
              { key: 'products', label: 'Ürün Analitiği', icon: ShoppingBagIcon },
              { key: 'trades', label: 'Takas Analitiği', icon: ArrowsRightLeftIcon },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Sales Analytics */}
        {activeTab === 'sales' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Toplam Sipariş"
                value={data?.salesReport.totalOrders?.toLocaleString() || 0}
                icon={ShoppingBagIcon}
                color="bg-blue-500"
              />
              <StatCard
                title="Toplam Gelir"
                value={`₺${data?.salesReport.totalRevenue?.toLocaleString() || 0}`}
                icon={CurrencyDollarIcon}
                color="bg-green-500"
              />
              <StatCard
                title="Komisyon Geliri"
                value={`₺${data?.salesReport.totalCommission?.toLocaleString() || 0}`}
                icon={ChartBarIcon}
                color="bg-primary-500"
              />
              <StatCard
                title="Ort. Sipariş Tutarı"
                value={`₺${data?.salesReport.averageOrderValue?.toFixed(2) || 0}`}
                icon={ArrowTrendingUpIcon}
                color="bg-purple-500"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="admin-card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Gelir Grafiği</h3>
                <div className="h-80">
                  <Line data={salesChartData} options={chartOptions} />
                </div>
              </div>
              <div className="admin-card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Sayısı</h3>
                <div className="h-80">
                  <Bar data={ordersChartData} options={chartOptions} />
                </div>
              </div>
            </div>

            {/* Order Status Distribution */}
            <div className="admin-card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Durumu Dağılımı</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data?.salesReport.ordersByStatus || {}).map(([status, count]) => (
                  <div key={status} className="bg-gray-100 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{String(count)}</p>
                    <p className="text-sm text-gray-500">{ORDER_STATUS_LABELS[status] ?? status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* User Analytics */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Toplam Kullanıcı"
                value={data?.userReport.totalUsers?.toLocaleString() || 0}
                icon={UsersIcon}
                color="bg-blue-500"
              />
              <StatCard
                title="Yeni Kullanıcılar"
                value={data?.userReport.newUsers?.toLocaleString() || 0}
                icon={ArrowTrendingUpIcon}
                color="bg-green-500"
              />
              <StatCard
                title="Aktif Kullanıcılar"
                value={data?.userReport.activeUsers?.toLocaleString() || 0}
                icon={ChartBarIcon}
                color="bg-primary-500"
              />
              <StatCard
                title="Satıcılar"
                value={data?.userReport.sellerCount?.toLocaleString() || 0}
                icon={ShoppingBagIcon}
                color="bg-purple-500"
              />
            </div>

            <div className="admin-card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Kullanıcı Büyümesi</h3>
              <div className="h-80">
                <Line data={userGrowthData} options={chartOptions} />
              </div>
            </div>
          </div>
        )}

        {/* Product Analytics */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Toplam Ürün"
                value={data?.productReport.totalProducts?.toLocaleString() || 0}
                icon={ShoppingBagIcon}
                color="bg-blue-500"
              />
              <StatCard
                title="Aktif Ürünler"
                value={data?.productReport.activeProducts?.toLocaleString() || 0}
                icon={ChartBarIcon}
                color="bg-green-500"
              />
              <StatCard
                title="Onay Bekleyen"
                value={data?.productReport.pendingProducts?.toLocaleString() || 0}
                icon={CalendarIcon}
                color="bg-yellow-500"
              />
              <StatCard
                title="Ort. Fiyat"
                value={`₺${data?.productReport.averagePrice?.toFixed(2) || 0}`}
                icon={CurrencyDollarIcon}
                color="bg-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="admin-card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Kategori Dağılımı</h3>
                <div className="h-80">
                  <Doughnut
                    data={categoryChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'right',
                          labels: { color: '#9ca3af' },
                        },
                      },
                    }}
                  />
                </div>
              </div>
              <div className="admin-card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Kategorilere Göre Ürünler</h3>
                <div className="space-y-4">
                  {data?.productReport.categoryDistribution?.map((cat: any) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-900">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-sm w-12 text-right">{cat.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trade Analytics */}
        {activeTab === 'trades' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                title="Toplam Takas"
                value={data?.tradeReport.totalTrades?.toLocaleString() || 0}
                icon={ArrowsRightLeftIcon}
                color="bg-blue-500"
              />
              <StatCard
                title="Tamamlanan"
                value={data?.tradeReport.completedTrades?.toLocaleString() || 0}
                icon={ChartBarIcon}
                color="bg-green-500"
              />
              <StatCard
                title="Bekleyen"
                value={data?.tradeReport.pendingTrades?.toLocaleString() || 0}
                icon={CalendarIcon}
                color="bg-yellow-500"
              />
              <StatCard
                title="Ort. Değer"
                value={`₺${data?.tradeReport.averageTradeValue?.toFixed(2) || 0}`}
                icon={CurrencyDollarIcon}
                color="bg-purple-500"
              />
            </div>

            <div className="admin-card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Takas İstatistikleri</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{data?.tradeReport.completedTrades || 0}</p>
                  <p className="text-sm text-gray-500">Tamamlanan</p>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{data?.tradeReport.pendingTrades || 0}</p>
                  <p className="text-sm text-gray-500">Bekleyen</p>
                </div>
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{data?.tradeReport.disputedTrades || 0}</p>
                  <p className="text-sm text-gray-500">Anlaşmazlık</p>
                </div>
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">
                    {data?.tradeReport.totalTrades && data?.tradeReport.completedTrades
                      ? ((data.tradeReport.completedTrades / data.tradeReport.totalTrades) * 100).toFixed(1)
                      : 0}%
                  </p>
                  <p className="text-sm text-gray-500">Başarı Oranı</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex justify-end gap-4">
          <button
            onClick={async () => {
              const type = activeTab === 'sales' ? 'sales' : activeTab === 'users' ? 'users' : activeTab === 'products' ? 'products' : 'trades';
              try {
                const res = await adminApi.exportReport(type, 'csv', getDateRangeParams());
                const content = (res.data as { content?: string })?.content ?? '';
                const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapor-${type}-${getDateRangeParams().startDate}-${getDateRangeParams().endDate}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) {
                if (process.env.NODE_ENV === 'development') console.error('CSV indirme hatası:', e);
              }
            }}
            className="btn-secondary"
          >
            CSV İndir
          </button>
          <button
            onClick={async () => {
              const type = activeTab === 'sales' ? 'sales' : activeTab === 'users' ? 'users' : activeTab === 'products' ? 'products' : 'trades';
              try {
                const res = await adminApi.exportReport(type, 'pdf', getDateRangeParams());
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapor-${type}-${getDateRangeParams().startDate}-${getDateRangeParams().endDate}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e) {
                if (process.env.NODE_ENV === 'development') console.error('Rapor indirme hatası:', e);
              }
            }}
            className="btn-primary"
          >
            JSON İndir
          </button>
        </div>
      </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="admin-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-gray-900" />
        </div>
      </div>
    </div>
  );
}
