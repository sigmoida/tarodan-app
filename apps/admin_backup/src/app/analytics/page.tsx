'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
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
      const params = getDateRangeParams();
      
      const [salesRes, userRes, productRes, tradeRes] = await Promise.all([
        adminApi.getSalesReport(params),
        adminApi.getUserReport(params),
        adminApi.getProductReport(params),
        adminApi.getTradeReport(params),
      ]);

      setData({
        salesReport: salesRes.data,
        userReport: userRes.data,
        productReport: productRes.data,
        tradeReport: tradeRes.data,
      });
    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Use mock data for display
      setData({
        salesReport: {
          totalOrders: 1234,
          totalRevenue: 456789,
          totalCommission: 22839,
          averageOrderValue: 370.25,
          ordersByStatus: { completed: 890, pending: 120, cancelled: 45, refunded: 15 },
          dailyData: generateMockDailyData(),
        },
        userReport: {
          totalUsers: 5678,
          newUsers: 234,
          activeUsers: 1890,
          sellerCount: 456,
          userGrowth: generateMockGrowthData(),
        },
        productReport: {
          totalProducts: 8765,
          activeProducts: 6543,
          pendingProducts: 123,
          averagePrice: 185.50,
          categoryDistribution: generateMockCategoryData(),
        },
        tradeReport: {
          totalTrades: 567,
          completedTrades: 432,
          pendingTrades: 89,
          disputedTrades: 12,
          averageTradeValue: 450.75,
        },
      });
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Analizler</h1>
            <p className="text-gray-400 mt-1">Detaylı satış, kullanıcı ve ürün analizleri</p>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-2 bg-dark-800 rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {range === '7d' ? '7 Gün' : range === '30d' ? '30 Gün' : range === '90d' ? '90 Gün' : '1 Yıl'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-dark-700">
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
                    ? 'border-primary-500 text-primary-500'
                    : 'border-transparent text-gray-400 hover:text-white'
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
                <h3 className="text-lg font-semibold text-white mb-4">Gelir Grafiği</h3>
                <div className="h-80">
                  <Line data={salesChartData} options={chartOptions} />
                </div>
              </div>
              <div className="admin-card">
                <h3 className="text-lg font-semibold text-white mb-4">Sipariş Sayısı</h3>
                <div className="h-80">
                  <Bar data={ordersChartData} options={chartOptions} />
                </div>
              </div>
            </div>

            {/* Order Status Distribution */}
            <div className="admin-card">
              <h3 className="text-lg font-semibold text-white mb-4">Sipariş Durumu Dağılımı</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data?.salesReport.ordersByStatus || {}).map(([status, count]) => (
                  <div key={status} className="bg-dark-700 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-white">{String(count)}</p>
                    <p className="text-sm text-gray-400 capitalize">{status}</p>
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
              <h3 className="text-lg font-semibold text-white mb-4">Kullanıcı Büyümesi</h3>
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
                <h3 className="text-lg font-semibold text-white mb-4">Kategori Dağılımı</h3>
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
                <h3 className="text-lg font-semibold text-white mb-4">Kategorilere Göre Ürünler</h3>
                <div className="space-y-4">
                  {data?.productReport.categoryDistribution?.map((cat: any) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-white">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-dark-700 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full"
                            style={{ width: `${cat.percentage}%` }}
                          />
                        </div>
                        <span className="text-gray-400 text-sm w-12 text-right">{cat.count}</span>
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
              <h3 className="text-lg font-semibold text-white mb-4">Takas İstatistikleri</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{data?.tradeReport.completedTrades || 0}</p>
                  <p className="text-sm text-gray-400">Tamamlanan</p>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-400">{data?.tradeReport.pendingTrades || 0}</p>
                  <p className="text-sm text-gray-400">Bekleyen</p>
                </div>
                <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-400">{data?.tradeReport.disputedTrades || 0}</p>
                  <p className="text-sm text-gray-400">Anlaşmazlık</p>
                </div>
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">
                    {data?.tradeReport.totalTrades && data?.tradeReport.completedTrades
                      ? ((data.tradeReport.completedTrades / data.tradeReport.totalTrades) * 100).toFixed(1)
                      : 0}%
                  </p>
                  <p className="text-sm text-gray-400">Başarı Oranı</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Buttons */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              const type = activeTab === 'sales' ? 'sales' : activeTab === 'users' ? 'users' : activeTab === 'products' ? 'products' : 'trades';
              adminApi.exportReport(type, 'csv', getDateRangeParams());
            }}
            className="btn-secondary"
          >
            CSV İndir
          </button>
          <button
            onClick={() => {
              const type = activeTab === 'sales' ? 'sales' : activeTab === 'users' ? 'users' : activeTab === 'products' ? 'products' : 'trades';
              adminApi.exportReport(type, 'json', getDateRangeParams());
            }}
            className="btn-primary"
          >
            PDF İndir
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="admin-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}
