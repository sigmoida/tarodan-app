'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  TagIcon,
  ShoppingBagIcon,
  ArrowsRightLeftIcon,
  RectangleStackIcon,
  StarIcon,
  CurrencyDollarIcon,
  EyeIcon,
  HeartIcon,
  ChartBarIcon,
  TrophyIcon,
  SparklesIcon,
  ClockIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ShoppingCartIcon,
  FireIcon,
  CheckBadgeIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n';

interface UserStats {
  // Basic counts
  productsCount: number;
  activeProductsCount: number;
  soldProductsCount: number;
  ordersCount: number;
  completedOrdersCount: number;
  tradesCount: number;
  successfulTradesCount: number;
  collectionsCount: number;
  
  // Engagement
  totalViews: number;
  totalFavorites: number;
  
  // Rating
  rating: number;
  reviewsCount: number;
  
  // Revenue
  totalRevenue: number;
  totalSpent: number;
  
  // Membership info
  memberSince: string;
  membershipTier: string;
}

export default function StatisticsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadStatistics();
  }, [isAuthenticated]);

  const loadStatistics = async () => {
    try {
      const response = await api.get('/users/me/stats').catch(() => null);

      if (response?.data) {
        setStats(response.data);
      } else {
        // Fallback: fetch data from multiple endpoints
        const [productsRes, ordersRes, tradesRes, collectionsRes, profileRes] = await Promise.all([
          api.get('/products/my').catch(() => ({ data: { data: [], meta: { total: 0 } } })),
          api.get('/orders/my').catch(() => ({ data: { data: [], meta: { total: 0 } } })),
          api.get('/trades').catch(() => ({ data: { data: [] } })),
          api.get('/collections/me').catch(() => ({ data: { data: [] } })),
          api.get('/users/me').catch(() => ({ data: {} })),
        ]);

        const products = productsRes.data.data || productsRes.data.products || [];
        const orders = ordersRes.data.data || ordersRes.data.orders || [];
        const trades = tradesRes.data.data || tradesRes.data.trades || [];
        const collections = collectionsRes.data.data || collectionsRes.data.collections || [];
        const profile = profileRes.data;

        // Calculate stats from products
        const activeProducts = products.filter((p: any) => p.status === 'active');
        const soldProducts = products.filter((p: any) => p.status === 'sold');
        const totalViews = products.reduce((sum: number, p: any) => sum + (p.viewCount || 0), 0);
        const totalFavorites = products.reduce((sum: number, p: any) => sum + (p.likeCount || 0), 0);

        // Calculate revenue from sold products
        const totalRevenue = soldProducts.reduce((sum: number, p: any) => sum + (parseFloat(p.price) || 0), 0);

        // Calculate spent from completed orders
        const completedOrders = orders.filter((o: any) => ['delivered', 'completed'].includes(o.status));
        const totalSpent = completedOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0);

        // Calculate successful trades
        const successfulTrades = trades.filter((t: any) => t.status === 'completed');

        setStats({
          productsCount: products.length,
          activeProductsCount: activeProducts.length,
          soldProductsCount: soldProducts.length,
          ordersCount: orders.length,
          completedOrdersCount: completedOrders.length,
          tradesCount: trades.length,
          successfulTradesCount: successfulTrades.length,
          collectionsCount: collections.length,
          totalViews,
          totalFavorites,
          rating: profile.rating || 0,
          reviewsCount: profile.reviewsCount || 0,
          totalRevenue,
          totalSpent,
          memberSince: profile.createdAt || user?.createdAt || new Date().toISOString(),
          membershipTier: profile.membershipTier || user?.membershipTier || 'free',
        });
      }
    } catch (error) {
      console.error('Statistics load error:', error);
      // Set default stats to prevent error state
      setStats({
        productsCount: 0,
        activeProductsCount: 0,
        soldProductsCount: 0,
        ordersCount: 0,
        completedOrdersCount: 0,
        tradesCount: 0,
        successfulTradesCount: 0,
        collectionsCount: 0,
        totalViews: 0,
        totalFavorites: 0,
        rating: 0,
        reviewsCount: 0,
        totalRevenue: 0,
        totalSpent: 0,
        memberSince: user?.createdAt || new Date().toISOString(),
        membershipTier: user?.membershipTier || 'free',
      });
    } finally {
      setLoading(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-orange-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-gray-200 rounded-xl w-1/3" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate membership duration
  const memberSinceDate = stats?.memberSince ? new Date(stats.memberSince) : new Date();
  const membershipDays = Math.floor((Date.now() - memberSinceDate.getTime()) / (1000 * 60 * 60 * 24));
  const membershipMonths = Math.floor(membershipDays / 30);

  // Stat Card Component
  const StatCard = ({ 
    title, 
    value, 
    subtitle,
    icon: Icon, 
    gradient,
    delay = 0,
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string;
    icon: any; 
    gradient: string;
    delay?: number;
  }) => (
    <motion.div 
      variants={itemVariants}
      className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all duration-300 group"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${gradient} shadow-lg group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </motion.div>
  );

  // Large Stat Card Component
  const LargeStatCard = ({ 
    title, 
    value, 
    subtitle,
    icon: Icon, 
    gradient,
    extraInfo,
  }: { 
    title: string; 
    value: string | number; 
    subtitle?: string;
    icon: any; 
    gradient: string;
    extraInfo?: { label: string; value: string | number }[];
  }) => (
    <motion.div 
      variants={itemVariants}
      className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl ${gradient} shadow-lg`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {extraInfo && (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
          {extraInfo.map((info, i) => (
            <div key={i} className="text-center p-2 bg-gray-50 rounded-lg">
              <p className="text-lg font-semibold text-gray-900">{info.value}</p>
              <p className="text-xs text-gray-500">{info.label}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-orange-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-orange-100 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
                <ChartBarIcon className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">İstatistiklerim</h1>
                <p className="text-orange-100">Hesap özeti ve performans verileri</p>
              </div>
            </div>
            
            {/* Membership Badge */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
              <TrophyIcon className="w-6 h-6 text-amber-300" />
              <div>
                <p className="text-sm text-orange-100">Üyelik Süresi</p>
                <p className="font-semibold">
                  {membershipMonths > 0 ? `${membershipMonths} ay` : `${membershipDays} gün`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 -mt-4">
        {stats && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8"
          >
            {/* Main Stats - Large Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <LargeStatCard
                title="İlanlarım"
                value={stats.productsCount}
                icon={TagIcon}
                gradient="bg-gradient-to-br from-blue-500 to-blue-600"
                extraInfo={[
                  { label: 'Aktif', value: stats.activeProductsCount },
                  { label: 'Satıldı', value: stats.soldProductsCount },
                ]}
              />
              
              <LargeStatCard
                title="Siparişlerim"
                value={stats.ordersCount}
                icon={ShoppingBagIcon}
                gradient="bg-gradient-to-br from-green-500 to-emerald-500"
                extraInfo={[
                  { label: 'Tamamlanan', value: stats.completedOrdersCount },
                  { label: 'Bekleyen', value: stats.ordersCount - stats.completedOrdersCount },
                ]}
              />
              
              <LargeStatCard
                title="Takaslarım"
                value={stats.tradesCount}
                icon={ArrowsRightLeftIcon}
                gradient="bg-gradient-to-br from-purple-500 to-violet-500"
                extraInfo={[
                  { label: 'Başarılı', value: stats.successfulTradesCount },
                  { label: 'Oran', value: stats.tradesCount > 0 ? `%${Math.round((stats.successfulTradesCount / stats.tradesCount) * 100)}` : '%0' },
                ]}
              />
            </div>

            {/* Financial Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div 
                variants={itemVariants}
                className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <ArrowTrendingUpIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-green-100">Toplam Kazanç</p>
                    <p className="text-4xl font-bold">₺{stats.totalRevenue.toLocaleString('tr-TR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-green-100 text-sm">
                  <CheckBadgeIcon className="w-5 h-5" />
                  <span>{stats.soldProductsCount} ürün satışından</span>
                </div>
              </motion.div>
              
              <motion.div 
                variants={itemVariants}
                className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-lg"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <ShoppingCartIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-orange-100">Toplam Harcama</p>
                    <p className="text-4xl font-bold">₺{stats.totalSpent.toLocaleString('tr-TR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-orange-100 text-sm">
                  <CheckBadgeIcon className="w-5 h-5" />
                  <span>{stats.completedOrdersCount} sipariş tamamlandı</span>
                </div>
              </motion.div>
            </div>

            {/* Engagement & Other Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Görüntüleme"
                value={stats.totalViews.toLocaleString('tr-TR')}
                subtitle="Tüm ilanlar"
                icon={EyeIcon}
                gradient="bg-gradient-to-br from-cyan-500 to-blue-500"
              />
              <StatCard
                title="Favori"
                value={stats.totalFavorites.toLocaleString('tr-TR')}
                subtitle="Beğeniler"
                icon={HeartIcon}
                gradient="bg-gradient-to-br from-red-500 to-pink-500"
              />
              <StatCard
                title="Koleksiyon"
                value={stats.collectionsCount}
                subtitle="Oluşturulan"
                icon={RectangleStackIcon}
                gradient="bg-gradient-to-br from-indigo-500 to-purple-500"
              />
              <StatCard
                title="Puan"
                value={stats.rating > 0 ? stats.rating.toFixed(1) : '-'}
                subtitle={stats.reviewsCount > 0 ? `${stats.reviewsCount} değerlendirme` : 'Henüz yok'}
                icon={StarIcon}
                gradient="bg-gradient-to-br from-amber-500 to-yellow-500"
              />
            </div>

            {/* Rating Stars Display */}
            {stats.rating > 0 && (
              <motion.div 
                variants={itemVariants}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-xl shadow-lg">
                      <TrophyIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Satıcı Puanı</h3>
                      <p className="text-sm text-gray-500">{stats.reviewsCount} müşteri değerlendirmesi</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarSolidIcon 
                          key={star}
                          className={`w-8 h-8 ${star <= Math.round(stats.rating) ? 'text-amber-400' : 'text-gray-200'}`}
                        />
                      ))}
                    </div>
                    <span className="text-3xl font-bold text-gray-900 ml-2">{stats.rating.toFixed(1)}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick Links */}
            <motion.div 
              variants={itemVariants}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FireIcon className="w-5 h-5 text-orange-500" />
                Hızlı Erişim
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link 
                  href="/profile/listings"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all group"
                >
                  <TagIcon className="w-5 h-5 text-gray-500 group-hover:text-orange-500" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">İlanlarım</span>
                </Link>
                <Link 
                  href="/orders"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all group"
                >
                  <ShoppingBagIcon className="w-5 h-5 text-gray-500 group-hover:text-orange-500" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">Siparişlerim</span>
                </Link>
                <Link 
                  href="/trades"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all group"
                >
                  <ArrowsRightLeftIcon className="w-5 h-5 text-gray-500 group-hover:text-orange-500" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">Takaslarım</span>
                </Link>
                <Link 
                  href="/collections"
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all group"
                >
                  <RectangleStackIcon className="w-5 h-5 text-gray-500 group-hover:text-orange-500" />
                  <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600">Koleksiyonlarım</span>
                </Link>
              </div>
            </motion.div>

            {/* Membership Info */}
            <motion.div 
              variants={itemVariants}
              className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 rounded-2xl p-6 text-white"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <CalendarDaysIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Üyelik Başlangıcı</p>
                    <p className="text-xl font-semibold">
                      {memberSinceDate.toLocaleDateString('tr-TR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                      {membershipMonths > 0 
                        ? `${membershipMonths} aydır aramızdasınız` 
                        : `${membershipDays} gündür aramızdasınız`}
                    </p>
                  </div>
                </div>
                <Link
                  href="/analytics"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg"
                >
                  <SparklesIcon className="w-5 h-5" />
                  Detaylı Analiz
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
