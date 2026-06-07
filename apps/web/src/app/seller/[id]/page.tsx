'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon,
  StarIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  FlagIcon,
  ShieldCheckIcon,
  ArrowsRightLeftIcon,
  CheckBadgeIcon,
  CubeIcon,
  TruckIcon,
  ArrowTrendingUpIcon,
  HeartIcon,
  EyeIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { 
  StarIcon as StarSolidIcon,
  CheckBadgeIcon as CheckBadgeSolidIcon,
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { api, listingsApi, ratingsApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useAuthStore } from '@/stores/authStore';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button } from '@tarodan/ui';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);
const ReportModal = dynamic(
  withChunkErrorLogging(() => import('@/components/ReportModal'), 'ReportModal'),
  { ssr: false }
);

interface UserRating {
  id: string;
  score: number;
  comment?: string;
  giverName?: string;
  createdAt: string;
  giver?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

interface RatingStats {
  totalRatings: number;
  averageScore: number;
  scoreDistribution?: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

interface Seller {
  id: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  isVerified: boolean;
  isPremium?: boolean;
  trustScore?: number;
  trustLevel?: string;
  sellerType?: string;
  stats?: {
    totalListings: number;
    totalSales: number;
    totalTrades: number;
    averageRating: number;
    totalRatings: number;
  };
}

interface Product {
  id: string;
  title: string;
  price: number;
  images: Array<{ url: string }>;
  condition: string;
  isTradeEnabled?: boolean;
  viewCount?: number;
  likeCount?: number;
}

export default function SellerProfilePage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const sellerId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [tab, setTab] = useState<'listings' | 'reviews'>('listings');

  const sellerQuery = useQuery({
    queryKey: ['seller', sellerId],
    queryFn: async (): Promise<Seller | null> => {
      const [profileRes, ratingStatsRes] = await Promise.all([
        api.get(`/users/${sellerId}/profile`).catch(() => null),
        ratingsApi.getUserStats(sellerId).catch(() => null),
      ]);
      const statsData = ratingStatsRes?.data;
      if (profileRes?.data) {
        return {
          ...profileRes.data,
          stats: {
            ...profileRes.data.stats,
            averageRating: statsData?.averageScore ?? profileRes.data.stats?.averageRating ?? 0,
            totalRatings: statsData?.totalRatings ?? profileRes.data.stats?.totalRatings ?? 0,
          }
        };
      }
      const productsRes = await listingsApi.getAll({ sellerId, limit: 1 });
      const firstProduct = productsRes.data?.data?.[0] || productsRes.data?.products?.[0];
      if (firstProduct?.seller) {
        return {
          id: firstProduct.seller.id,
          displayName: firstProduct.seller.displayName,
          avatarUrl: firstProduct.seller.avatarUrl,
          createdAt: firstProduct.seller.createdAt || new Date().toISOString(),
          isVerified: firstProduct.seller.isVerified || false,
          isPremium: firstProduct.seller.isPremium || false,
          stats: {
            totalListings: 0,
            totalSales: 0,
            totalTrades: 0,
            averageRating: statsData?.averageScore ?? firstProduct.seller.rating ?? 0,
            totalRatings: statsData?.totalRatings ?? firstProduct.seller.totalRatings ?? 0,
          }
        };
      }
      return null;
    },
    enabled: !!sellerId,
    meta: { page: 'seller-profile' },
  });
  const seller = sellerQuery.data ?? null;
  const isLoading = sellerQuery.isLoading;
  const followersCount = (seller as any)?.followersCount ?? 0;

  const productsQuery = useQuery({
    queryKey: ['seller-products', sellerId],
    queryFn: async (): Promise<Product[]> => {
      const response = await listingsApi.getAll({ sellerId, status: 'active', limit: 50 });
      return response.data?.data || response.data?.products || [];
    },
    enabled: !!sellerId,
    meta: { page: 'seller-products' },
  });
  const products = productsQuery.data ?? [];

  const followQuery = useQuery({
    queryKey: ['follow', sellerId],
    queryFn: async () => {
      const response = await api.get(`/users/${sellerId}/follow`);
      return response.data.following;
    },
    enabled: !!sellerId && !!isAuthenticated && user?.id !== sellerId,
    meta: { page: 'seller-follow' },
  });
  const isFollowing = followQuery.data ?? false;

  const reviewsQuery = useQuery({
    queryKey: ['seller-reviews', sellerId],
    queryFn: async (): Promise<UserRating[]> => {
      const response = await ratingsApi.getUserRatings(sellerId);
      return response.data?.ratings || response.data?.data || [];
    },
    enabled: !!sellerId,
    meta: { page: 'seller-reviews' },
  });
  const reviews = reviewsQuery.data ?? [];
  const reviewsLoading = reviewsQuery.isLoading;

  const ratingStatsQuery = useQuery({
    queryKey: ['seller-rating-stats', sellerId],
    queryFn: async () => {
      const res = await ratingsApi.getUserStats(sellerId);
      return res.data;
    },
    enabled: !!sellerId,
    meta: { page: 'seller-rating-stats' },
  });
  const ratingStats = ratingStatsQuery.data ?? null;

  const handleFollow = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    try {
      if (isFollowing) {
        await api.delete(`/users/${sellerId}/follow`);
        toast.success(t('seller.unfollowed'));
      } else {
        await api.post(`/users/${sellerId}/follow`);
        toast.success(t('seller.followed'));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['follow', sellerId] }),
        queryClient.invalidateQueries({ queryKey: ['seller', sellerId] }),
      ]);
    } catch (error) {
      toast.error(t('common.operationFailed'));
    }
  };

  const handleMessage = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    window.location.href = `/messages?to=${sellerId}`;
  };

  const handleReport = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setShowReportModal(true);
  };

  const getImageUrl = (images: any[]): string => {
    const placeholder = 'https://placehold.co/400x400/f8fafc/94a3b8?text=' + (locale === 'en' ? 'Product' : 'Ürün');
    if (!images || images.length === 0) return placeholder;
    const img = images[0];
    return (img as any)?.cardUrl ?? (img as any)?.detailUrl ?? (img as any)?.url ?? (typeof img === 'string' ? img : null) ?? placeholder;
  };

  const getMembershipDuration = () => {
    const created = new Date(seller?.createdAt || '');
    const now = new Date();
    const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
    
    if (months < 1) return locale === 'en' ? 'New member' : 'Yeni üye';
    if (months < 12) return locale === 'en' ? `${months} months` : `${months} ay`;
    const years = Math.floor(months / 12);
    return locale === 'en' ? `${years}+ years` : `${years}+ yıl`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-surface to-surface-elevated flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-primary-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted">{locale === 'en' ? 'Loading profile...' : 'Profil yükleniyor...'}</p>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-surface to-surface-elevated flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-24 h-24 bg-surface-alt rounded-full flex items-center justify-center mx-auto mb-6">
            <UserIcon className="w-12 h-12 text-subtle" />
          </div>
          <h2 className="text-2xl font-bold text-heading mb-3">{t('seller.notFound')}</h2>
          <p className="text-muted mb-6">
            {locale === 'en' 
              ? 'The seller you are looking for does not exist or has been removed.'
              : 'Aradığınız satıcı bulunamadı veya kaldırılmış olabilir.'}
          </p>
          <Link 
            href="/listings" 
            className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-inverted px-6 py-3 rounded-xl font-medium transition-colors"
          >
            {t('seller.backToListings')}
          </Link>
        </div>
      </div>
    );
  }

  const isOwnProfile = user?.id === sellerId;
  const hasRatings = (seller.stats?.totalRatings || 0) > 0;
  const averageRating = seller.stats?.averageRating || 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface to-surface-elevated">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500 via-primary-600 to-warning-600">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-96 h-96 bg-surface-elevated rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-surface-elevated rounded-full translate-x-1/3 translate-y-1/3"></div>
          </div>
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
            {/* Avatar Section */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative flex-shrink-0"
            >
              <div className="relative">
                <UserAvatar displayName={seller.displayName} avatarUrl={seller.avatarUrl} size="xl" ring className="!w-36 !h-36 md:!w-40 md:!h-40 !text-5xl rounded-2xl bg-surface-elevated/20 backdrop-blur-sm text-inverted shadow-2xl ring-4 ring-inverted/30" />
                {seller.isVerified && (
                  <div className="absolute -bottom-3 -right-3 bg-surface-elevated rounded-xl p-2 shadow-lg">
                    <CheckBadgeSolidIcon className="w-7 h-7 text-success-500" />
                  </div>
                )}
              </div>
            </motion.div>

            {/* Info Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex-1 text-center lg:text-left text-inverted"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
                <h1 className="text-3xl md:text-4xl font-bold">{seller.displayName}</h1>
                {seller.isPremium && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-400/90 text-amber-950 text-sm font-bold px-3 py-1.5 rounded-full">
                    <StarSolidIcon className="w-4 h-4" />
                    Premium
                  </span>
                )}
                {seller.isVerified && (
                  <span className="inline-flex items-center gap-1.5 bg-surface-elevated/20 backdrop-blur-sm text-inverted text-sm px-3 py-1.5 rounded-full">
                    <CheckBadgeIcon className="w-4 h-4" />
                    {t('seller.verified')}
                  </span>
                )}
              </div>
              
              {seller.bio && (
                <p className="text-inverted/80 max-w-xl mb-4 text-lg">{seller.bio}</p>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-inverted/70 text-sm mb-6">
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {getMembershipDuration()}
                </span>
                {hasRatings && (
                  <span className="flex items-center gap-2">
                    <StarSolidIcon className="w-4 h-4 text-warning-300" />
                    <span className="text-inverted font-semibold">{averageRating.toFixed(1)}</span>
                    <span>({seller.stats?.totalRatings} {locale === 'en' ? 'reviews' : 'değerlendirme'})</span>
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <HeartIcon className="w-4 h-4" />
                  {followersCount} {locale === 'en' ? 'followers' : 'takipçi'}
                </span>
                {seller.isPremium && typeof seller.trustScore === 'number' && (
                  <span className="flex items-center gap-2 bg-amber-400/90 text-amber-950 font-bold px-3 py-1 rounded-full">
                    <CheckBadgeSolidIcon className="w-4 h-4" />
                    {locale === 'en' ? 'Trust Score' : 'Güven Skoru'} {seller.trustScore}/100
                    {seller.trustLevel && <span className="font-medium">· {seller.trustLevel}</span>}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              {!isOwnProfile && (
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                  <Button variant="secondary" onClick={handleMessage}
                    className="flex items-center gap-2 bg-surface-elevated text-primary-600 hover:bg-primary-50 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl">
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    {t('product.sendMessage')}
                  </Button>
                  <Button variant="secondary" onClick={handleFollow}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                      isFollowing 
                        ? 'bg-surface-elevated/20 text-inverted hover:bg-surface-elevated/30 backdrop-blur-sm' 
                        : 'bg-primary-700/50 text-inverted hover:bg-primary-700/70 backdrop-blur-sm'
                    }`}>
                    <HeartIcon className={`w-5 h-5 ${isFollowing ? 'fill-current' : ''}`} />
                    {isFollowing ? t('seller.following') : t('seller.follow')}
                  </Button>
                  <Button variant="secondary" onClick={handleReport}
                    className="p-3 rounded-xl bg-surface-elevated/10 text-inverted/70 hover:bg-surface-elevated/20 hover:text-inverted transition-all backdrop-blur-sm"
                    title={t('seller.report')}>
                    <FlagIcon className="w-5 h-5" />
                  </Button>
                </div>
              )}
            </motion.div>

            {/* Stats Cards */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-3 lg:gap-4"
            >
              <div className="bg-surface-elevated/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-surface-elevated/20 transition-colors">
                <CubeIcon className="w-6 h-6 text-inverted/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-inverted">{seller.stats?.totalListings || products.length}</p>
                <p className="text-inverted/60 text-xs md:text-sm">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div className="bg-surface-elevated/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-surface-elevated/20 transition-colors">
                <TruckIcon className="w-6 h-6 text-inverted/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-inverted">{seller.stats?.totalSales || 0}</p>
                <p className="text-inverted/60 text-xs md:text-sm">{locale === 'en' ? 'Sales' : 'Satış'}</p>
              </div>
              <div className="bg-surface-elevated/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-surface-elevated/20 transition-colors">
                <ArrowsRightLeftIcon className="w-6 h-6 text-inverted/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-inverted">{seller.stats?.totalTrades || 0}</p>
                <p className="text-inverted/60 text-xs md:text-sm">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-surface-alt p-1.5 rounded-xl w-fit">
          <Button variant="secondary" onClick={() => setTab('listings')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
              tab === 'listings'
                ? 'bg-surface-elevated text-primary-600 shadow-sm'
                : 'text-muted hover:text-heading'
            }`}>
            <CubeIcon className="w-5 h-5" />
            {t('nav.listings')}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              tab === 'listings' ? 'bg-primary-100 text-primary-600' : 'bg-border-subtle text-muted'
            }`}>
              {products.length}
            </span>
          </Button>
          <Button variant="secondary" onClick={() => {
              setTab('reviews');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
              tab === 'reviews'
                ? 'bg-surface-elevated text-primary-600 shadow-sm'
                : 'text-muted hover:text-heading'
            }`}>
            <StarIcon className="w-5 h-5" />
            {t('review.reviews')}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              tab === 'reviews' ? 'bg-primary-100 text-primary-600' : 'bg-border-subtle text-muted'
            }`}>
              {seller.stats?.totalRatings || 0}
            </span>
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {/* Listings Tab */}
          {tab === 'listings' && (
            <motion.div
              key="listings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {products.length === 0 ? (
                <div className="text-center py-16 bg-surface-elevated rounded-2xl border border-border-subtle">
                  <CubeIcon className="w-16 h-16 text-border-strong mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-heading mb-2">
                    {locale === 'en' ? 'No listings yet' : 'Henüz ilan yok'}
                  </h3>
                  <p className="text-muted">{t('seller.noActiveListings')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {products.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <Link 
                        href={`/listings/${product.id}`} 
                        className="block bg-surface-elevated rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group border border-border-subtle"
                      >
                        <div className="relative aspect-square bg-surface">
                          <OptimizedImage
                            src={getImageUrl(product.images)}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                            fallbackSrc="https://placehold.co/400x400/f8fafc/94a3b8?text=Ürün"
                            logContext={{ productId: product.id, page: 'seller-products' }}
                          />
                          {product.isTradeEnabled && (
                            <div className="absolute top-2 left-2 bg-success-500 text-inverted text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                              <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                              {locale === 'en' ? 'Trade' : 'Takas'}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-heading/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="p-3">
                          <h3 className="font-medium text-heading line-clamp-2 text-sm group-hover:text-primary-600 transition-colors mb-2">
                            {product.title}
                          </h3>
                          <div className="flex items-center justify-between">
                            <p className="text-primary-600 font-bold">
                              ₺{getProductEffectivePrice(product).toLocaleString('tr-TR')}
                            </p>
                            {(product.viewCount || 0) > 0 && (
                              <span className="flex items-center gap-1 text-xs text-subtle">
                                <EyeIcon className="w-3.5 h-3.5" />
                                {product.viewCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Reviews Tab */}
          {tab === 'reviews' && (
            <motion.div
              key="reviews"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {reviewsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-4 border-primary-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin"></div>
                  </div>
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-16 bg-surface-elevated rounded-2xl border border-border-subtle">
                  <StarIcon className="w-16 h-16 text-border-strong mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-heading mb-2">
                    {locale === 'en' ? 'No reviews yet' : 'Henüz değerlendirme yok'}
                  </h3>
                  <p className="text-muted">{t('review.noReviews')}</p>
                </div>
              ) : (
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Rating Summary */}
                  <div className="lg:col-span-1">
                    <div className="bg-surface-elevated rounded-2xl p-6 border border-border-subtle sticky top-24">
                      <div className="text-center mb-6">
                        <div className="text-5xl font-bold text-heading mb-2">
                          {averageRating.toFixed(1)}
                        </div>
                        <div className="flex justify-center gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarSolidIcon
                              key={star}
                              className={`w-6 h-6 ${
                                star <= Math.round(averageRating)
                                  ? 'text-warning-400'
                                  : 'text-border-subtle'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-muted text-sm">
                          {seller.stats?.totalRatings || 0} {locale === 'en' ? 'total reviews' : 'değerlendirme'}
                        </p>
                      </div>

                      {/* Rating Distribution */}
                      {ratingStats?.scoreDistribution && (
                        <div className="space-y-2">
                          {[5, 4, 3, 2, 1].map((score) => {
                            const count = ratingStats.scoreDistribution?.[score as keyof typeof ratingStats.scoreDistribution] || 0;
                            const percentage = ratingStats.totalRatings > 0 
                              ? (count / ratingStats.totalRatings) * 100 
                              : 0;
                            
                            return (
                              <div key={score} className="flex items-center gap-3">
                                <span className="text-sm text-muted w-3">{score}</span>
                                <StarSolidIcon className="w-4 h-4 text-warning-400" />
                                <div className="flex-1 h-2 bg-surface-alt rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-warning-400 rounded-full transition-all duration-500"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm text-muted w-8">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reviews List */}
                  <div className="lg:col-span-2 space-y-4">
                    {reviews.map((review, index) => {
                      const reviewerName = review.giverName || review.giver?.displayName || '';
                      return (
                        <motion.div
                          key={review.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-surface-elevated rounded-xl p-5 border border-border-subtle hover:border-border transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            {/* Reviewer Avatar */}
                            <div className="flex-shrink-0">
                              <UserAvatar displayName={reviewerName} avatarUrl={review.giver?.avatarUrl} size="sm" className="!w-11 !h-11 rounded-xl shadow-sm" />
                            </div>
                            
                            {/* Review Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div>
                                  <p className="font-semibold text-heading">{reviewerName || t('common.user')}</p>
                                  <p className="text-xs text-muted">
                                    {new Date(review.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5 bg-warning-50 px-2 py-1 rounded-lg">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <StarSolidIcon
                                      key={star}
                                      className={`w-4 h-4 ${
                                        star <= review.score
                                          ? 'text-warning-400'
                                          : 'text-border-subtle'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              {review.comment && (
                                <p className="text-muted text-sm leading-relaxed whitespace-pre-line">{review.comment}</p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={t('auth.authRequiredMessage')}
      />

      {seller && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          entityType="user"
          entityId={seller.id}
          entityName={seller.displayName}
          locale={locale}
        />
      )}
    </div>
  );
}
