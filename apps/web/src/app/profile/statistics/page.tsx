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
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useTranslation } from '@/i18n';

interface RecentSale {
  id: string;
  productTitle: string;
  productImage?: string;
  buyerName: string;
  amount: number;
  soldAt: string;
  orderId?: string;
}

interface UserStats {
  productsCount: number;
  activeProductsCount: number;
  soldProductsCount: number;
  ordersCount: number;
  completedOrdersCount: number;
  purchasesCount: number;
  salesCount: number;
  tradesCount: number;
  successfulTradesCount: number;
  collectionsCount: number;
  totalViews: number;
  totalFavorites: number;
  rating: number;
  reviewsCount: number;
  totalRevenue: number;
  totalSpent: number;
  memberSince: string;
  membershipTier: string;
}

export default function StatisticsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadStatistics();
    loadRecentSales();
  }, [authLoading, isAuthenticated]);

  const loadStatistics = async () => {
    try {
      const response = await api.get('/users/me/stats').catch(() => null);

      if (response?.data) {
        setStats(response.data);
      } else {
        // Fallback: fetch data from multiple endpoints
        // (sipariş listesi GET /orders'tır; /orders/my diye bir uç yok)
        const [productsRes, ordersRes, tradesRes, collectionsRes, profileRes] = await Promise.all([
          api.get('/products/my').catch(() => ({ data: { data: [], meta: { total: 0 } } })),
          api.get('/orders', { params: { role: 'buyer', limit: 100 } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
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

        // Calculate spent from paid orders (sipariş alanı totalAmount'tur, total değil)
        const completedOrders = orders.filter((o: any) => ['delivered', 'completed'].includes(o.status));
        const paidOrders = orders.filter((o: any) =>
          ['paid', 'preparing', 'shipped', 'delivered', 'awaiting_buyer_confirmation', 'completed'].includes(o.status)
        );
        const totalSpent = paidOrders.reduce(
          (sum: number, o: any) => sum + (parseFloat(o.totalAmount ?? o.total) || 0),
          0
        );

        // Calculate successful trades
        const successfulTrades = trades.filter((t: any) => t.status === 'completed');

        setStats({
          productsCount: products.length,
          activeProductsCount: activeProducts.length,
          soldProductsCount: soldProducts.length,
          ordersCount: orders.length,
          completedOrdersCount: completedOrders.length,
          purchasesCount: paidOrders.length,
          salesCount: soldProducts.length,
          tradesCount: trades.length,
          successfulTradesCount: successfulTrades.length,
          collectionsCount: collections.length,
          totalViews,
          totalFavorites,
          rating: profile.stats?.averageRating ?? profile.rating ?? 0,
          reviewsCount: profile.stats?.totalRatings ?? profile.reviewsCount ?? 0,
          totalRevenue,
          totalSpent,
          memberSince: profile.createdAt || user?.createdAt || new Date().toISOString(),
          membershipTier: profile.membershipTier || user?.membershipTier || 'free',
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Statistics load error:', error);
      // Set default stats to prevent error state
      setStats({
        productsCount: 0,
        activeProductsCount: 0,
        soldProductsCount: 0,
        ordersCount: 0,
        completedOrdersCount: 0,
        purchasesCount: 0,
        salesCount: 0,
        tradesCount: 0,
        successfulTradesCount: 0,
        collectionsCount: 0,
        totalViews: 0,
        totalFavorites: 0,
        rating: 0,
        reviewsCount: 0,
        totalRevenue: 0,
        totalSpent: 0,
        memberSince: user?.createdAt ? (typeof user.createdAt === 'string' ? user.createdAt : new Date(user.createdAt).toISOString()) : new Date().toISOString(),
        membershipTier: user?.membershipTier || 'free',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRecentSales = async () => {
    try {
      const response = await api.get('/orders', { params: { role: 'seller', limit: 10 } }).catch(() => null);
      if (response?.data) {
        const orders = response.data.data || response.data.orders || [];
        const sales: RecentSale[] = orders
          .filter((o: any) => o.isSeller || o.sellerId === user?.id)
          .slice(0, 10)
          .map((o: any) => ({
            id: o.id,
            productTitle: o.product?.title || o.items?.[0]?.product?.title || 'Ürün',
            productImage: o.product?.imageUrl || o.items?.[0]?.product?.imageUrl,
            buyerName: o.buyer?.displayName || 'Alıcı',
            amount: parseFloat(o.totalAmount || o.amount || o.total || '0'),
            soldAt: o.createdAt,
            orderId: o.id,
          }));
        setRecentSales(sales);
      }
    } catch {
      // Silently fail
    }
  };

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

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-border-subtle rounded-xl w-1/3" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-32 bg-border-subtle rounded-2xl" />
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
      className="bg-surface-elevated rounded-2xl p-5 shadow-sm border border-border-subtle hover:shadow-lg hover:border-primary-200 transition-all duration-300 group"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${gradient} shadow-lg group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6 text-inverted" />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold text-heading">{value}</p>
          <p className="text-sm text-muted">{title}</p>
          {subtitle && <p className="text-xs text-subtle mt-0.5">{subtitle}</p>}
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
      className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle hover:shadow-lg transition-all duration-300"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-xl ${gradient} shadow-lg`}>
          <Icon className="w-6 h-6 text-inverted" />
        </div>
        <div>
          <p className="text-sm text-muted">{title}</p>
          <p className="text-3xl font-bold text-heading">{value}</p>
          {subtitle && <p className="text-xs text-subtle">{subtitle}</p>}
        </div>
      </div>
      {extraInfo && (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border-subtle">
          {extraInfo.map((info, i) => (
            <div key={i} className="text-center p-2 bg-surface rounded-lg">
              <p className="text-lg font-semibold text-heading">{info.value}</p>
              <p className="text-xs text-muted">{info.label}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-600 to-warning-500 text-inverted">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-primary-100 hover:text-inverted mb-6 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-surface-elevated/20 rounded-2xl backdrop-blur-sm">
                <ChartBarIcon className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">İstatistiklerim</h1>
                <p className="text-primary-100">Hesap özeti ve performans verileri</p>
              </div>
            </div>
            
            {/* Membership Badge */}
            <div className="flex items-center gap-3 bg-surface-elevated/10 backdrop-blur-sm rounded-xl px-4 py-3">
              <TrophyIcon className="w-6 h-6 text-warning-300" />
              <div>
                <p className="text-sm text-primary-100">Üyelik Süresi</p>
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
                gradient="bg-gradient-to-br from-info-500 to-info-600"
                extraInfo={[
                  { label: 'Aktif', value: stats.activeProductsCount },
                  { label: 'Satıldı', value: stats.soldProductsCount },
                ]}
              />
              
              <LargeStatCard
                title="Siparişlerim"
                value={stats.ordersCount}
                icon={ShoppingBagIcon}
                gradient="bg-gradient-to-br from-success-500 to-success-500"
                extraInfo={[
                  { label: 'Tamamlanan', value: stats.completedOrdersCount },
                  { label: 'Bekleyen', value: stats.ordersCount - stats.completedOrdersCount },
                ]}
              />
              
              <LargeStatCard
                title="Takaslarım"
                value={stats.tradesCount}
                icon={ArrowsRightLeftIcon}
                gradient="bg-gradient-to-br from-primary-500 to-primary-500"
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
                className="bg-gradient-to-br from-success-500 to-success-600 rounded-2xl p-6 text-inverted shadow-lg"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-surface-elevated/20 rounded-xl">
                    <ArrowTrendingUpIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-success-100">Toplam Kazanç</p>
                    <p className="text-4xl font-bold">{stats.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-success-100 text-sm">
                  <CheckBadgeIcon className="w-5 h-5" />
                  <span>{stats.salesCount} satıştan</span>
                </div>
              </motion.div>
              
              <motion.div 
                variants={itemVariants}
                className="bg-gradient-to-br from-primary-500 to-warning-500 rounded-2xl p-6 text-inverted shadow-lg"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-surface-elevated/20 rounded-xl">
                    <ShoppingCartIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-primary-100">Toplam Harcama</p>
                    <p className="text-4xl font-bold">{stats.totalSpent.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-primary-100 text-sm">
                  <CheckBadgeIcon className="w-5 h-5" />
                  <span>{stats.purchasesCount} siparişten</span>
                </div>
              </motion.div>
            </div>

            {/* Recent Sales */}
            {recentSales.length > 0 && (
              <motion.div 
                variants={itemVariants}
                className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-heading flex items-center gap-2">
                    <ShoppingBagIcon className="w-5 h-5 text-success-500" />
                    Son Satışlar
                  </h3>
                  <Link 
                    href="/orders" 
                    className="text-sm text-primary-500 hover:text-primary-600 font-medium"
                  >
                    Tümünü Gör
                  </Link>
                </div>
                <div className="space-y-3">
                  {recentSales.map((sale) => (
                    <Link 
                      key={sale.id}
                      href={`/orders?highlight=${sale.orderId}`}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-surface transition-colors group"
                    >
                      <div className="w-12 h-12 rounded-lg bg-surface-alt overflow-hidden flex-shrink-0">
                        {sale.productImage ? (
                          <img src={sale.productImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <TagIcon className="w-5 h-5 text-subtle" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-heading truncate group-hover:text-primary-600">
                          {sale.productTitle}
                        </p>
                        <p className="text-xs text-muted">
                          @{sale.buyerName} &middot; {new Date(sale.soldAt).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-success-600 whitespace-nowrap">
                        +{sale.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </span>
                    </Link>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Engagement & Other Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Görüntüleme"
                value={stats.totalViews.toLocaleString('tr-TR')}
                subtitle="Tüm ilanlar"
                icon={EyeIcon}
                gradient="bg-gradient-to-br from-info-500 to-info-500"
              />
              <StatCard
                title="Favori"
                value={stats.totalFavorites.toLocaleString('tr-TR')}
                subtitle="Beğeniler"
                icon={HeartIcon}
                gradient="bg-gradient-to-br from-danger-500 to-danger-500"
              />
              <StatCard
                title="Koleksiyon"
                value={stats.collectionsCount}
                subtitle="Oluşturulan"
                icon={RectangleStackIcon}
                gradient="bg-gradient-to-br from-info-500 to-primary-500"
              />
              <StatCard
                title="Puan"
                value={stats.rating > 0 ? stats.rating.toFixed(1) : '-'}
                subtitle={stats.reviewsCount > 0 ? `${stats.reviewsCount} değerlendirme` : 'Henüz yok'}
                icon={StarIcon}
                gradient="bg-gradient-to-br from-warning-500 to-warning-500"
              />
            </div>

            {/* Rating Stars Display */}
            {stats.rating > 0 && (
              <motion.div 
                variants={itemVariants}
                className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-warning-400 to-warning-500 rounded-xl shadow-lg">
                      <TrophyIcon className="w-6 h-6 text-inverted" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-heading">Satıcı Puanı</h3>
                      <p className="text-sm text-muted">{stats.reviewsCount} müşteri değerlendirmesi</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarSolidIcon 
                          key={star}
                          className={`w-8 h-8 ${star <= Math.round(stats.rating) ? 'text-warning-400' : 'text-border-subtle'}`}
                        />
                      ))}
                    </div>
                    <span className="text-3xl font-bold text-heading ml-2">{stats.rating.toFixed(1)}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Quick Links */}
            <motion.div 
              variants={itemVariants}
              className="bg-surface-elevated rounded-2xl p-6 shadow-sm border border-border-subtle"
            >
              <h3 className="font-semibold text-heading mb-4 flex items-center gap-2">
                <FireIcon className="w-5 h-5 text-primary-500" />
                Hızlı Erişim
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link 
                  href="/profile/listings"
                  className="flex items-center gap-3 p-4 bg-surface rounded-xl hover:bg-primary-50 hover:border-primary-200 border border-transparent transition-all group"
                >
                  <TagIcon className="w-5 h-5 text-muted group-hover:text-primary-500" />
                  <span className="text-sm font-medium text-body group-hover:text-primary-600">İlanlarım</span>
                </Link>
                <Link 
                  href="/orders"
                  className="flex items-center gap-3 p-4 bg-surface rounded-xl hover:bg-primary-50 hover:border-primary-200 border border-transparent transition-all group"
                >
                  <ShoppingBagIcon className="w-5 h-5 text-muted group-hover:text-primary-500" />
                  <span className="text-sm font-medium text-body group-hover:text-primary-600">Siparişlerim</span>
                </Link>
                <Link 
                  href="/trades"
                  className="flex items-center gap-3 p-4 bg-surface rounded-xl hover:bg-primary-50 hover:border-primary-200 border border-transparent transition-all group"
                >
                  <ArrowsRightLeftIcon className="w-5 h-5 text-muted group-hover:text-primary-500" />
                  <span className="text-sm font-medium text-body group-hover:text-primary-600">Takaslarım</span>
                </Link>
                <Link
                  href="/profile/collections"
                  className="flex items-center gap-3 p-4 bg-surface rounded-xl hover:bg-primary-50 hover:border-primary-200 border border-transparent transition-all group"
                >
                  <RectangleStackIcon className="w-5 h-5 text-muted group-hover:text-primary-500" />
                  <span className="text-sm font-medium text-body group-hover:text-primary-600">Koleksiyonlarım</span>
                </Link>
              </div>
            </motion.div>

            {/* Membership Info */}
            <motion.div 
              variants={itemVariants}
              className="bg-gradient-to-r from-body via-heading to-body rounded-2xl p-6 text-inverted"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-surface-elevated/10 rounded-xl">
                    <CalendarDaysIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-subtle text-sm">Üyelik Başlangıcı</p>
                    <p className="text-xl font-semibold">
                      {memberSinceDate.toLocaleDateString('tr-TR', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    <p className="text-muted text-sm mt-1">
                      {membershipMonths > 0 
                        ? `${membershipMonths} aydır aramızdasınız` 
                        : `${membershipDays} gündür aramızdasınız`}
                    </p>
                  </div>
                </div>
                <Link
                  href="/analytics"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-warning-500 text-inverted rounded-xl font-semibold hover:from-primary-600 hover:to-warning-600 transition-all shadow-lg"
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
