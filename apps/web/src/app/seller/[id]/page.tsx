'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
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
import { useAuthStore } from '@/stores/authStore';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import ReportModal from '@/components/ReportModal';
import { useTranslation } from '@/i18n/LanguageContext';

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
  const sellerId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
  
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<UserRating[]>([]);
  const [ratingStats, setRatingStats] = useState<RatingStats | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [tab, setTab] = useState<'listings' | 'reviews'>('listings');

  useEffect(() => {
    if (sellerId) {
      fetchSeller();
      fetchProducts();
      if (isAuthenticated && user?.id !== sellerId) {
        checkFollowingStatus();
      }
    }
  }, [sellerId, isAuthenticated]);

  const checkFollowingStatus = async () => {
    try {
      const response = await api.get(`/users/${sellerId}/follow`);
      setIsFollowing(response.data.following);
    } catch (error) {
      setIsFollowing(false);
    }
  };

  const fetchSeller = async () => {
    try {
      const [profileRes, ratingStatsRes] = await Promise.all([
        api.get(`/users/${sellerId}/profile`).catch(() => null),
        ratingsApi.getUserStats(sellerId).catch(() => null),
      ]);
      
      const statsData = ratingStatsRes?.data;
      if (statsData) {
        setRatingStats(statsData);
      }
      
      if (profileRes?.data) {
        setSeller({
          ...profileRes.data,
          stats: {
            ...profileRes.data.stats,
            averageRating: statsData?.averageScore || profileRes.data.stats?.averageRating || 0,
            totalRatings: statsData?.totalRatings || profileRes.data.stats?.totalRatings || 0,
          }
        });
        setFollowersCount(profileRes.data.followersCount || 0);
      } else {
        const productsRes = await listingsApi.getAll({ sellerId, limit: 1 });
        const firstProduct = productsRes.data?.data?.[0] || productsRes.data?.products?.[0];
        if (firstProduct?.seller) {
          setSeller({
            id: firstProduct.seller.id,
            displayName: firstProduct.seller.displayName,
            avatarUrl: firstProduct.seller.avatarUrl,
            createdAt: firstProduct.seller.createdAt || new Date().toISOString(),
            isVerified: firstProduct.seller.isVerified || false,
            stats: {
              totalListings: 0,
              totalSales: 0,
              totalTrades: 0,
              averageRating: statsData?.averageScore || firstProduct.seller.rating || 0,
              totalRatings: statsData?.totalRatings || firstProduct.seller.totalRatings || 0,
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch seller:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await listingsApi.getAll({ 
        sellerId, 
        status: 'active',
        limit: 50 
      });
      const data = response.data?.data || response.data?.products || [];
      setProducts(data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchReviews = async () => {
    setReviewsLoading(true);
    try {
      const response = await ratingsApi.getUserRatings(sellerId);
      const ratingsData = response.data?.ratings || response.data?.data || [];
      setReviews(ratingsData);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    try {
      if (isFollowing) {
        await api.delete(`/users/${sellerId}/follow`);
        setIsFollowing(false);
        setFollowersCount(prev => Math.max(0, prev - 1));
        toast.success(t('seller.unfollowed'));
      } else {
        await api.post(`/users/${sellerId}/follow`);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        toast.success(t('seller.followed'));
      }
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
    const placeholder = 'https://placehold.co/400x400/f8fafc/94a3b8?text=';
    if (!images || images.length === 0) return placeholder + (locale === 'en' ? 'Product' : 'Ürün');
    return images[0]?.url || images[0] || placeholder;
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
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-orange-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div>
          </div>
          <p className="text-gray-500">{locale === 'en' ? 'Loading profile...' : 'Profil yükleniyor...'}</p>
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserIcon className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{t('seller.notFound')}</h2>
          <p className="text-gray-500 mb-6">
            {locale === 'en' 
              ? 'The seller you are looking for does not exist or has been removed.'
              : 'Aradığınız satıcı bulunamadı veya kaldırılmış olabilir.'}
          </p>
          <Link 
            href="/listings" 
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-medium transition-colors"
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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white rounded-full translate-x-1/3 translate-y-1/3"></div>
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
                {seller.avatarUrl ? (
                  <Image
                    src={seller.avatarUrl}
                    alt={seller.displayName}
                    width={160}
                    height={160}
                    className="w-36 h-36 md:w-40 md:h-40 rounded-2xl object-cover shadow-2xl ring-4 ring-white/30"
                  />
                ) : (
                  <div className="w-36 h-36 md:w-40 md:h-40 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-5xl font-bold shadow-2xl ring-4 ring-white/30">
                    {seller.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                {seller.isVerified && (
                  <div className="absolute -bottom-3 -right-3 bg-white rounded-xl p-2 shadow-lg">
                    <CheckBadgeSolidIcon className="w-7 h-7 text-green-500" />
                  </div>
                )}
              </div>
            </motion.div>

            {/* Info Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex-1 text-center lg:text-left text-white"
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
                <h1 className="text-3xl md:text-4xl font-bold">{seller.displayName}</h1>
                {seller.isVerified && (
                  <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full">
                    <CheckBadgeIcon className="w-4 h-4" />
                    {t('seller.verified')}
                  </span>
                )}
              </div>
              
              {seller.bio && (
                <p className="text-white/80 max-w-xl mb-4 text-lg">{seller.bio}</p>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-white/70 text-sm mb-6">
                <span className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  {getMembershipDuration()}
                </span>
                {hasRatings && (
                  <span className="flex items-center gap-2">
                    <StarSolidIcon className="w-4 h-4 text-yellow-300" />
                    <span className="text-white font-semibold">{averageRating.toFixed(1)}</span>
                    <span>({seller.stats?.totalRatings} {locale === 'en' ? 'reviews' : 'değerlendirme'})</span>
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <HeartIcon className="w-4 h-4" />
                  {followersCount} {locale === 'en' ? 'followers' : 'takipçi'}
                </span>
              </div>

              {/* Action Buttons */}
              {!isOwnProfile && (
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                  <button
                    onClick={handleMessage}
                    className="flex items-center gap-2 bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
                  >
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    {t('product.sendMessage')}
                  </button>
                  <button
                    onClick={handleFollow}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                      isFollowing 
                        ? 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm' 
                        : 'bg-orange-700/50 text-white hover:bg-orange-700/70 backdrop-blur-sm'
                    }`}
                  >
                    <HeartIcon className={`w-5 h-5 ${isFollowing ? 'fill-current' : ''}`} />
                    {isFollowing ? t('seller.following') : t('seller.follow')}
                  </button>
                  <button
                    onClick={handleReport}
                    className="p-3 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all backdrop-blur-sm"
                    title={t('seller.report')}
                  >
                    <FlagIcon className="w-5 h-5" />
                  </button>
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
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-white/20 transition-colors">
                <CubeIcon className="w-6 h-6 text-white/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-white">{seller.stats?.totalListings || products.length}</p>
                <p className="text-white/60 text-xs md:text-sm">{locale === 'en' ? 'Listings' : 'İlan'}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-white/20 transition-colors">
                <TruckIcon className="w-6 h-6 text-white/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-white">{seller.stats?.totalSales || 0}</p>
                <p className="text-white/60 text-xs md:text-sm">{locale === 'en' ? 'Sales' : 'Satış'}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 md:p-5 text-center min-w-[90px] hover:bg-white/20 transition-colors">
                <ArrowsRightLeftIcon className="w-6 h-6 text-white/70 mx-auto mb-2" />
                <p className="text-2xl md:text-3xl font-bold text-white">{seller.stats?.totalTrades || 0}</p>
                <p className="text-white/60 text-xs md:text-sm">{locale === 'en' ? 'Trades' : 'Takas'}</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-gray-100 p-1.5 rounded-xl w-fit">
          <button
            onClick={() => setTab('listings')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
              tab === 'listings'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CubeIcon className="w-5 h-5" />
            {t('nav.listings')}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              tab === 'listings' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-600'
            }`}>
              {products.length}
            </span>
          </button>
          <button
            onClick={() => {
              setTab('reviews');
              if (reviews.length === 0) {
                fetchReviews();
              }
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${
              tab === 'reviews'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <StarIcon className="w-5 h-5" />
            {t('review.reviews')}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              tab === 'reviews' ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-600'
            }`}>
              {seller.stats?.totalRatings || 0}
            </span>
          </button>
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
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <CubeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {locale === 'en' ? 'No listings yet' : 'Henüz ilan yok'}
                  </h3>
                  <p className="text-gray-500">{t('seller.noActiveListings')}</p>
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
                        className="block bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group border border-gray-100"
                      >
                        <div className="relative aspect-square bg-gray-50">
                          <Image
                            src={getImageUrl(product.images)}
                            alt={product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          {product.isTradeEnabled && (
                            <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                              <ArrowsRightLeftIcon className="w-3.5 h-3.5" />
                              {locale === 'en' ? 'Trade' : 'Takas'}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="p-3">
                          <h3 className="font-medium text-gray-900 line-clamp-2 text-sm group-hover:text-orange-600 transition-colors mb-2">
                            {product.title}
                          </h3>
                          <div className="flex items-center justify-between">
                            <p className="text-orange-600 font-bold">
                              ₺{product.price.toLocaleString('tr-TR')}
                            </p>
                            {(product.viewCount || 0) > 0 && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
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
                    <div className="absolute inset-0 rounded-full border-4 border-orange-200"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin"></div>
                  </div>
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <StarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {locale === 'en' ? 'No reviews yet' : 'Henüz değerlendirme yok'}
                  </h3>
                  <p className="text-gray-500">{t('review.noReviews')}</p>
                </div>
              ) : (
                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Rating Summary */}
                  <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 sticky top-24">
                      <div className="text-center mb-6">
                        <div className="text-5xl font-bold text-gray-900 mb-2">
                          {averageRating.toFixed(1)}
                        </div>
                        <div className="flex justify-center gap-1 mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <StarSolidIcon
                              key={star}
                              className={`w-6 h-6 ${
                                star <= Math.round(averageRating)
                                  ? 'text-yellow-400'
                                  : 'text-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-gray-500 text-sm">
                          {seller.stats?.totalRatings} {locale === 'en' ? 'total reviews' : 'değerlendirme'}
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
                                <span className="text-sm text-gray-600 w-3">{score}</span>
                                <StarSolidIcon className="w-4 h-4 text-yellow-400" />
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-500 w-8">{count}</span>
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
                      const reviewerInitial = reviewerName?.charAt(0)?.toUpperCase() || '?';
                      
                      return (
                        <motion.div
                          key={review.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-white rounded-xl p-5 border border-gray-100 hover:border-gray-200 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            {/* Reviewer Avatar */}
                            <div className="flex-shrink-0">
                              {review.giver?.avatarUrl ? (
                                <Image
                                  src={review.giver.avatarUrl}
                                  alt={reviewerName}
                                  width={48}
                                  height={48}
                                  className="w-11 h-11 rounded-xl object-cover"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-semibold shadow-sm">
                                  {reviewerInitial}
                                </div>
                              )}
                            </div>
                            
                            {/* Review Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div>
                                  <p className="font-semibold text-gray-900">{reviewerName || t('common.user')}</p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(review.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-0.5 bg-yellow-50 px-2 py-1 rounded-lg">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <StarSolidIcon
                                      key={star}
                                      className={`w-4 h-4 ${
                                        star <= review.score
                                          ? 'text-yellow-400'
                                          : 'text-gray-200'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              {review.comment && (
                                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{review.comment}</p>
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
