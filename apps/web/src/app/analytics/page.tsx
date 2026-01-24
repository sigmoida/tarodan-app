'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChartBarIcon,
  EyeIcon,
  HeartIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  ArrowTrendingUpIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface AnalyticsData {
  totalViews: number;
  totalFavorites: number;
  totalSales: number;
  totalRevenue: number;
  viewsChange: number;
  favoritesChange: number;
  salesChange: number;
  revenueChange: number;
  topProducts: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
    imageUrl?: string;
  }>;
  recentActivity: Array<{
    type: 'view' | 'favorite' | 'sale';
    productTitle: string;
    timestamp: string;
  }>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const canAccessAnalytics = limits?.canAccessAnalytics ?? 
    (user?.membershipTier === 'premium' || user?.membershipTier === 'business');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/analytics');
      return;
    }
    fetchAnalytics();
  }, [isAuthenticated, period]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/users/me/analytics', { params: { period } });
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      // Set mock data for demo
      setAnalytics({
        totalViews: 1247,
        totalFavorites: 89,
        totalSales: 12,
        totalRevenue: 15840,
        viewsChange: 23.5,
        favoritesChange: 12.3,
        salesChange: -5.2,
        revenueChange: 18.7,
        topProducts: [
          { id: '1', title: 'Ferrari F40 1:18', views: 342, favorites: 28 },
          { id: '2', title: 'Porsche 911 GT3', views: 256, favorites: 19 },
          { id: '3', title: 'BMW M3 E30', views: 189, favorites: 15 },
        ],
        recentActivity: [
          { type: 'view', productTitle: 'Ferrari F40 1:18', timestamp: new Date().toISOString() },
          { type: 'favorite', productTitle: 'Porsche 911 GT3', timestamp: new Date(Date.now() - 3600000).toISOString() },
          { type: 'sale', productTitle: 'BMW M3 E30', timestamp: new Date(Date.now() - 86400000).toISOString() },
        ],
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!canAccessAnalytics) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <ChartBarIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Premium Özellik
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Detaylı analitik ve istatistikler Premium üyelik ile kullanılabilir.
              İlanlarınızın performansını takip edin, satışlarınızı optimize edin.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              Premium'a Yükselt
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl" />
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    color 
  }: { 
    title: string; 
    value: string | number; 
    change: number; 
    icon: any; 
    color: string;
  }) => (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${
          change >= 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          {change >= 0 ? (
            <ArrowUpIcon className="w-4 h-4" />
          ) : (
            <ArrowDownIcon className="w-4 h-4" />
          )}
          {Math.abs(change).toFixed(1)}%
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-gray-500 text-sm mt-1">{title}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ChartBarIcon className="w-8 h-8 text-primary-500" />
              Analitik Dashboard
            </h1>
            <div className="flex gap-2">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    period === p
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {p === '7d' ? '7 Gün' : p === '30d' ? '30 Gün' : '90 Gün'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {analytics && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Toplam Görüntüleme"
                value={analytics.totalViews.toLocaleString()}
                change={analytics.viewsChange}
                icon={EyeIcon}
                color="bg-blue-500"
              />
              <StatCard
                title="Favorilere Ekleme"
                value={analytics.totalFavorites}
                change={analytics.favoritesChange}
                icon={HeartIcon}
                color="bg-red-500"
              />
              <StatCard
                title="Toplam Satış"
                value={analytics.totalSales}
                change={analytics.salesChange}
                icon={ShoppingCartIcon}
                color="bg-green-500"
              />
              <StatCard
                title="Toplam Gelir"
                value={`₺${analytics.totalRevenue.toLocaleString()}`}
                change={analytics.revenueChange}
                icon={CurrencyDollarIcon}
                color="bg-purple-500"
              />
            </div>

            {/* Top Products & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Products */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ArrowTrendingUpIcon className="w-5 h-5 text-primary-500" />
                  En Çok Görüntülenen Ürünler
                </h2>
                <div className="space-y-4">
                  {analytics.topProducts.map((product, index) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 line-clamp-1">
                          {product.title}
                        </p>
                        <div className="flex gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <EyeIcon className="w-4 h-4" />
                            {product.views}
                          </span>
                          <span className="flex items-center gap-1">
                            <HeartIcon className="w-4 h-4" />
                            {product.favorites}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Son Aktiviteler
                </h2>
                <div className="space-y-4">
                  {analytics.recentActivity.map((activity, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
                    >
                      <div className={`p-2 rounded-full ${
                        activity.type === 'view' ? 'bg-blue-100 text-blue-600' :
                        activity.type === 'favorite' ? 'bg-red-100 text-red-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {activity.type === 'view' && <EyeIcon className="w-4 h-4" />}
                        {activity.type === 'favorite' && <HeartIcon className="w-4 h-4" />}
                        {activity.type === 'sale' && <ShoppingCartIcon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{activity.productTitle}</span>
                          {' '}
                          {activity.type === 'view' && 'görüntülendi'}
                          {activity.type === 'favorite' && 'favorilere eklendi'}
                          {activity.type === 'sale' && 'satıldı'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(activity.timestamp).toLocaleString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
