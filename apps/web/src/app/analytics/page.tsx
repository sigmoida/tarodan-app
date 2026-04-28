'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  EyeIcon,
  HeartIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  UserGroupIcon,
  TagIcon,
  StarIcon,
  SparklesIcon,
  ArrowsRightLeftIcon,
  DocumentTextIcon,
  BoltIcon,
  FireIcon,
  TrophyIcon,
  CalendarDaysIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import api from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useTranslation } from '@/i18n';import { Button } from '@tarodan/ui';


interface AnalyticsData {
  // Overview Stats
  totalViews: number;
  totalFavorites: number;
  totalSales: number;
  totalRevenue: number;
  activeListings: number;
  pendingOrders: number;
  
  // Change percentages
  viewsChange: number;
  favoritesChange: number;
  salesChange: number;
  revenueChange: number;
  
  // Engagement
  avgViewsPerListing: number;
  conversionRate: number; // views to sales
  avgTimeToSell: number; // days
  repeatCustomerRate: number;
  
  // Top Products
  topProducts: Array<{
    id: string;
    title: string;
    views: number;
    favorites: number;
    imageUrl?: string;
    price: number;
    status: string;
  }>;
  
  // Daily Views (last 7 or 30 days)
  dailyViews: Array<{
    date: string;
    views: number;
    favorites: number;
  }>;
  
  // Recent Activity
  recentActivity: Array<{
    type: 'view' | 'favorite' | 'sale' | 'message' | 'trade_offer';
    productTitle: string;
    timestamp: string;
    amount?: number;
    userDisplayName?: string;
  }>;
  
  // Category Performance
  categoryStats: Array<{
    name: string;
    listings: number;
    views: number;
    sales: number;
  }>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user, limits } = useAuthStore();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  // Allow analytics for all authenticated users (with limited features for free)
  const canAccessAnalytics = isAuthenticated;
  const isPremium = user?.membershipTier === 'premium' || user?.membershipTier === 'business';

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/analytics');
      return;
    }
    fetchAnalytics();
  }, [authLoading, isAuthenticated, period]);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/users/me/analytics', { params: { period } });
      // Ensure all required fields have default values
      const data = response.data;
      setAnalytics({
        totalViews: data.totalViews || 0,
        totalFavorites: data.totalFavorites || 0,
        totalSales: data.totalSales || 0,
        totalRevenue: data.totalRevenue || 0,
        activeListings: data.activeListings || 0,
        pendingOrders: data.pendingOrders || 0,
        viewsChange: data.viewsChange || 0,
        favoritesChange: data.favoritesChange || 0,
        salesChange: data.salesChange || 0,
        revenueChange: data.revenueChange || 0,
        avgViewsPerListing: data.avgViewsPerListing || 0,
        conversionRate: data.conversionRate || 0,
        avgTimeToSell: data.avgTimeToSell || 0,
        repeatCustomerRate: data.repeatCustomerRate || 0,
        topProducts: data.topProducts || [],
        dailyViews: data.dailyViews || [],
        recentActivity: data.recentActivity || [],
        categoryStats: data.categoryStats || [],
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch analytics:', error);
      // Set empty/zero data on error - no fake data
      const daysInPeriod = period === '7d' ? 7 : period === '30d' ? 14 : 14;
      const dailyViews = Array.from({ length: daysInPeriod }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (daysInPeriod - 1 - i));
        return {
          date: date.toISOString().split('T')[0],
          views: 0,
          favorites: 0,
        };
      });

      setAnalytics({
        totalViews: 0,
        totalFavorites: 0,
        totalSales: 0,
        totalRevenue: 0,
        activeListings: 0,
        pendingOrders: 0,
        viewsChange: 0,
        favoritesChange: 0,
        salesChange: 0,
        revenueChange: 0,
        avgViewsPerListing: 0,
        conversionRate: 0,
        avgTimeToSell: 0,
        repeatCustomerRate: 0,
        topProducts: [],
        dailyViews,
        recentActivity: [],
        categoryStats: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  if (authLoading) return <AuthLoadingScreen />;
  if (!canAccessAnalytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated rounded-2xl p-12 text-center shadow-xl border border-primary-100"
          >
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <ChartBarIcon className="w-10 h-10 text-inverted" />
            </div>
            <h2 className="text-3xl font-bold text-heading mb-3">
              Giriş Yapmanız Gerekiyor
            </h2>
            <p className="text-muted mb-8 max-w-md mx-auto">
              İstatistiklerinizi ve performans verilerinizi görüntülemek için lütfen giriş yapın.
            </p>
            <Link
              href="/login?redirect=/analytics"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-inverted rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              Giriş Yap
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-border-subtle rounded-xl w-1/3" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-36 bg-border-subtle rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-80 bg-border-subtle rounded-2xl" />
              <div className="h-80 bg-border-subtle rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mini chart component for the stat cards
  const MiniChart = ({ data, color }: { data: number[]; color: string }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    return (
      <div className="flex items-end gap-0.5 h-8">
        {data.slice(-7).map((value, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full ${color}`}
            style={{ 
              height: `${((value - min) / range) * 100}%`,
              minHeight: '4px',
              opacity: 0.3 + (i / 10)
            }}
          />
        ))}
      </div>
    );
  };

  // Main Stat Card component
  const StatCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    gradient,
    chartData,
    chartColor,
    subtitle,
  }: { 
    title: string; 
    value: string | number; 
    change?: number; 
    icon: any; 
    gradient: string;
    chartData?: number[];
    chartColor?: string;
    subtitle?: string;
  }) => (
    <motion.div 
      variants={itemVariants}
      className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle hover:shadow-lg transition-all duration-300 group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${gradient} shadow-lg group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6 text-inverted" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-semibold px-2 py-1 rounded-lg ${
            change >= 0 ? 'text-success-700 bg-success-50' : 'text-danger-700 bg-danger-50'
          }`}>
            {change >= 0 ? (
              <ArrowTrendingUpIcon className="w-4 h-4" />
            ) : (
              <ArrowTrendingDownIcon className="w-4 h-4" />
            )}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-heading">{value}</p>
          <p className="text-muted text-sm mt-1">{title}</p>
          {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
        </div>
        {chartData && chartColor && (
          <MiniChart data={chartData} color={chartColor} />
        )}
      </div>
    </motion.div>
  );

  // Simple bar chart component
  const SimpleBarChart = ({ data }: { data: { date: string; views: number; favorites: number }[] }) => {
    const maxViews = Math.max(...data.map(d => d.views));
    
    return (
      <div className="h-48 flex items-end gap-1">
        {data.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div 
              className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-lg hover:from-primary-600 hover:to-primary-500 transition-colors cursor-pointer group relative"
              style={{ height: `${(item.views / maxViews) * 100}%`, minHeight: '8px' }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-heading text-inverted text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {item.views} görüntüleme
              </div>
            </div>
            <span className="text-[10px] text-subtle transform -rotate-45 origin-top-left w-8 truncate">
              {new Date(item.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'view': return <EyeIcon className="w-4 h-4" />;
      case 'favorite': return <HeartSolidIcon className="w-4 h-4" />;
      case 'sale': return <ShoppingCartIcon className="w-4 h-4" />;
      case 'message': return <DocumentTextIcon className="w-4 h-4" />;
      case 'trade_offer': return <ArrowsRightLeftIcon className="w-4 h-4" />;
      default: return <BoltIcon className="w-4 h-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'view': return 'bg-info-100 text-info-600';
      case 'favorite': return 'bg-danger-100 text-danger-600';
      case 'sale': return 'bg-success-100 text-success-600';
      case 'message': return 'bg-primary-100 text-primary-600';
      case 'trade_offer': return 'bg-primary-100 text-primary-600';
      default: return 'bg-surface-alt text-muted';
    }
  };

  const getActivityText = (type: string) => {
    switch (type) {
      case 'view': return 'görüntülendi';
      case 'favorite': return 'favorilere eklendi';
      case 'sale': return 'satıldı';
      case 'message': return 'hakkında mesaj geldi';
      case 'trade_offer': return 'için takas teklifi geldi';
      default: return '';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    return `${days} gün önce`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-600 to-warning-500 text-inverted">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-primary-100 hover:text-inverted mb-6 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-surface-elevated/20 rounded-xl backdrop-blur-sm">
                  <PresentationChartLineIcon className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Performans Analizi</h1>
                  <p className="text-primary-100">İlanlarınızın detaylı istatistikleri</p>
                </div>
              </div>
            </div>
            
            {/* Period Selector */}
            <div className="flex gap-2 bg-surface-elevated/10 backdrop-blur-sm rounded-xl p-1">
              {(['7d', '30d', '90d'] as const).map((p) => (
                <Button variant="secondary" key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-5 py-2.5 rounded-lg font-medium transition-all ${
                    period === p
                      ? 'bg-surface-elevated text-primary-600 shadow-lg'
                      : 'text-inverted/80 hover:bg-surface-elevated/10'
                  }`}>
                  {p === '7d' ? '7 Gün' : p === '30d' ? '30 Gün' : '90 Gün'}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 -mt-4">
        {analytics && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Toplam Görüntüleme"
                value={analytics.totalViews.toLocaleString('tr-TR')}
                change={analytics.viewsChange}
                icon={EyeIcon}
                gradient="bg-gradient-to-br from-info-500 to-info-600"
                chartData={analytics.dailyViews.map(d => d.views)}
                chartColor="bg-info-400"
                subtitle={`Günlük ort. ${analytics.avgViewsPerListing}`}
              />
              <StatCard
                title="Favoriye Ekleme"
                value={analytics.totalFavorites.toLocaleString('tr-TR')}
                change={analytics.favoritesChange}
                icon={HeartIcon}
                gradient="bg-gradient-to-br from-danger-500 to-danger-500"
                chartData={analytics.dailyViews.map(d => d.favorites)}
                chartColor="bg-danger-400"
              />
              <StatCard
                title="Toplam Satış"
                value={analytics.totalSales}
                change={analytics.salesChange}
                icon={ShoppingCartIcon}
                gradient="bg-gradient-to-br from-success-500 to-success-500"
                subtitle={`Dönüşüm oranı %${analytics.conversionRate.toFixed(2)}`}
              />
              <StatCard
                title="Toplam Gelir"
                value={`${analytics.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`}
                change={analytics.revenueChange}
                icon={CurrencyDollarIcon}
                gradient="bg-gradient-to-br from-primary-500 to-primary-500"
              />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div variants={itemVariants} className="bg-surface-elevated rounded-2xl p-5 shadow-sm border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-100 rounded-xl">
                    <TagIcon className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-heading">{analytics.activeListings}</p>
                    <p className="text-sm text-muted">Aktif İlan</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="bg-surface-elevated rounded-2xl p-5 shadow-sm border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-warning-100 rounded-xl">
                    <ClockIcon className="w-5 h-5 text-warning-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-heading">{analytics.avgTimeToSell}</p>
                    <p className="text-sm text-muted">Ort. Satış Süresi (gün)</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="bg-surface-elevated rounded-2xl p-5 shadow-sm border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-info-100 rounded-xl">
                    <UserGroupIcon className="w-5 h-5 text-info-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-heading">%{analytics.repeatCustomerRate}</p>
                    <p className="text-sm text-muted">Tekrar Müşteri</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="bg-surface-elevated rounded-2xl p-5 shadow-sm border border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-info-100 rounded-xl">
                    <ShoppingCartIcon className="w-5 h-5 text-info-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-heading">{analytics.pendingOrders}</p>
                    <p className="text-sm text-muted">Bekleyen Sipariş</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Charts & Activity Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Views Chart */}
              <motion.div 
                variants={itemVariants}
                className="lg:col-span-2 bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-heading">Görüntüleme Grafiği</h2>
                    <p className="text-sm text-muted">Son {period === '7d' ? '7' : period === '30d' ? '14' : '14'} günlük trend</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-primary-500" />
                      <span className="text-muted">Görüntüleme</span>
                    </div>
                  </div>
                </div>
                <SimpleBarChart data={analytics.dailyViews} />
              </motion.div>

              {/* Recent Activity */}
              <motion.div 
                variants={itemVariants}
                className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-heading">Son Aktiviteler</h2>
                  <FireIcon className="w-5 h-5 text-primary-500" />
                </div>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {analytics.recentActivity.map((activity, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-xl bg-surface hover:bg-surface-alt transition-colors"
                    >
                      <div className={`p-2 rounded-lg ${getActivityColor(activity.type)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-heading line-clamp-2">
                          <span className="font-medium">{activity.productTitle}</span>
                          {' '}{getActivityText(activity.type)}
                          {activity.amount && (
                            <span className="text-success-600 font-semibold"> {activity.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                          )}
                        </p>
                        {activity.userDisplayName && (
                          <p className="text-xs text-muted">{activity.userDisplayName}</p>
                        )}
                        <p className="text-xs text-subtle mt-0.5">{formatTimeAgo(activity.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Top Products & Category Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Products */}
              <motion.div 
                variants={itemVariants}
                className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-warning-400 to-primary-500 rounded-lg">
                      <TrophyIcon className="w-5 h-5 text-inverted" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-heading">En Popüler İlanlar</h2>
                      <p className="text-sm text-muted">Görüntülemeye göre sıralanmış</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {analytics.topProducts.map((product, index) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface transition-colors group"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                        index === 0 ? 'bg-gradient-to-br from-warning-400 to-primary-500 text-inverted' :
                        index === 1 ? 'bg-gradient-to-br from-border-strong to-subtle text-inverted' :
                        index === 2 ? 'bg-gradient-to-br from-warning-600 to-warning-700 text-inverted' :
                        'bg-surface-alt text-muted'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-heading truncate group-hover:text-primary-600 transition-colors">
                          {product.title}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-muted">
                          <span className="flex items-center gap-1">
                            <EyeIcon className="w-4 h-4" />
                            {product.views.toLocaleString('tr-TR')}
                          </span>
                          <span className="flex items-center gap-1">
                            <HeartIcon className="w-4 h-4" />
                            {product.favorites}
                          </span>
                          <span className="text-primary-600 font-medium">
                            {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </span>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                        product.status === 'active' ? 'bg-success-100 text-success-700' :
                        product.status === 'sold' ? 'bg-surface-alt text-muted' :
                        'bg-primary-100 text-primary-700'
                      }`}>
                        {product.status === 'active' ? 'Aktif' : product.status === 'sold' ? 'Satıldı' : product.status}
                      </div>
                    </Link>
                  ))}
                </div>
              </motion.div>

              {/* Category Performance */}
              <motion.div 
                variants={itemVariants}
                className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg">
                      <ChartBarIcon className="w-5 h-5 text-inverted" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-heading">Kategori Performansı</h2>
                      <p className="text-sm text-muted">Kategorilere göre dağılım</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {analytics.categoryStats.map((cat, index) => {
                    const maxViews = Math.max(...analytics.categoryStats.map(c => c.views));
                    const percentage = (cat.views / maxViews) * 100;
                    
                    return (
                      <div key={index} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-heading text-sm">{cat.name}</span>
                          <div className="flex items-center gap-3 text-sm text-muted">
                            <span>{cat.listings} ilan</span>
                            <span className="text-success-600 font-medium">{cat.sales} satış</span>
                          </div>
                        </div>
                        <div className="h-2.5 bg-surface-alt rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.8, delay: index * 0.1 }}
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-500 rounded-full"
                          />
                        </div>
                        <p className="text-xs text-subtle mt-1">{cat.views.toLocaleString('tr-TR')} görüntüleme</p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>

            {/* Premium Upsell for Free Users */}
            {!isPremium && (
              <motion.div
                variants={itemVariants}
                className="bg-gradient-to-r from-primary-500 via-primary-600 to-warning-500 rounded-2xl p-8 text-inverted relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-surface-elevated/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-surface-elevated/10 rounded-full translate-y-1/2 -translate-x-1/2" />
                
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-surface-elevated/20 rounded-xl backdrop-blur-sm">
                      <SparklesIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Premium'a Yükseltin</h3>
                      <p className="text-primary-100 max-w-md">
                        Daha detaylı analizler, gelişmiş grafikler, ihracat özellikleri ve 
                        kişiselleştirilmiş öneriler için Premium üyeliğe geçin.
                      </p>
                      <ul className="mt-3 space-y-1 text-sm text-primary-100">
                        <li className="flex items-center gap-2">
                          <StarSolidIcon className="w-4 h-4 text-warning-300" />
                          Detaylı satış tahminleri
                        </li>
                        <li className="flex items-center gap-2">
                          <StarSolidIcon className="w-4 h-4 text-warning-300" />
                          Rakip analizi
                        </li>
                        <li className="flex items-center gap-2">
                          <StarSolidIcon className="w-4 h-4 text-warning-300" />
                          PDF/Excel rapor indirme
                        </li>
                      </ul>
                    </div>
                  </div>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-surface-elevated text-primary-600 rounded-xl font-bold hover:bg-primary-50 transition-colors shadow-lg whitespace-nowrap"
                  >
                    <SparklesIcon className="w-5 h-5" />
                    Premium'a Geç
                  </Link>
                </div>
              </motion.div>
            )}

            {/* Tips Section */}
            <motion.div
              variants={itemVariants}
              className="bg-gradient-to-br from-info-50 to-info-50 rounded-2xl p-6 border border-info-100"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-info-100 rounded-xl">
                  <BoltIcon className="w-6 h-6 text-info-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-heading mb-2">💡 Performans İpuçları</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-muted">
                    <div className="flex items-start gap-2">
                      <span className="text-info-500 font-bold">1.</span>
                      <p>Ürün fotoğraflarınızı kaliteli ve farklı açılardan çekin</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-info-500 font-bold">2.</span>
                      <p>Başlıklarda marka ve model bilgilerini eksiksiz yazın</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-info-500 font-bold">3.</span>
                      <p>Piyasa fiyatlarını araştırarak rekabetçi fiyat belirleyin</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
