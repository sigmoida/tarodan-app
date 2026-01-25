'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  UserIcon,
  StarIcon,
  MapPinIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  FlagIcon,
  ShieldCheckIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import { api, listingsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import { useTranslation } from '@/i18n/LanguageContext';

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
}

export default function SellerProfilePage() {
  const params = useParams();
  const sellerId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
  
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
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
      // User not authenticated or error
      setIsFollowing(false);
    }
  };

  const fetchSeller = async () => {
    try {
      // Get user profile
      const response = await api.get(`/users/${sellerId}/profile`).catch(() => null);
      if (response?.data) {
        setSeller(response.data);
      } else {
        // Fallback: Get from product seller info
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
              averageRating: firstProduct.seller.rating || 0,
              totalRatings: firstProduct.seller.totalRatings || 0,
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

  const handleFollow = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    try {
      if (isFollowing) {
        await api.delete(`/users/${sellerId}/follow`);
        setIsFollowing(false);
        toast.success(t('seller.unfollowed'));
      } else {
        await api.post(`/users/${sellerId}/follow`);
        setIsFollowing(true);
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
    toast(t('common.comingSoon'));
  };

  const getImageUrl = (images: any[]): string => {
    const placeholder = locale === 'en' ? 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Product' : 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
    if (!images || images.length === 0) return placeholder;
    return images[0]?.url || images[0] || placeholder;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <UserIcon className="w-20 h-20 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('seller.notFound')}</h2>
          <Link href="/listings" className="btn-primary">
            {t('seller.backToListings')}
          </Link>
        </div>
      </div>
    );
  }

  const isOwnProfile = user?.id === sellerId;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            {/* Avatar */}
            <div className="relative">
              {seller.avatarUrl ? (
                <Image
                  src={seller.avatarUrl}
                  alt={seller.displayName}
                  width={128}
                  height={128}
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-primary-500 flex items-center justify-center text-white text-4xl font-bold border-4 border-white shadow-xl">
                  {seller.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {seller.isVerified && (
                <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2">
                  <ShieldCheckIcon className="w-5 h-5 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold flex items-center justify-center md:justify-start gap-2">
                {seller.displayName}
                {seller.isVerified && (
                  <span className="text-green-400 text-sm">({t('seller.verified')})</span>
                )}
              </h1>
              
              {seller.bio && (
                <p className="text-gray-300 mt-2 max-w-lg">{seller.bio}</p>
              )}

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-4 text-sm text-gray-300">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-4 h-4" />
                  {locale === 'en' 
                    ? `Member since ${new Date(seller.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`
                    : `${new Date(seller.createdAt).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })} tarihinden beri üye`}
                </span>
                
                {seller.stats && seller.stats.averageRating > 0 && (
                  <span className="flex items-center gap-1">
                    <StarSolidIcon className="w-4 h-4 text-yellow-400" />
                    {seller.stats.averageRating.toFixed(1)} ({seller.stats.totalRatings} {t('review.reviews')})
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              {!isOwnProfile && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-6">
                  <button
                    onClick={handleMessage}
                    className="btn-primary flex items-center gap-2"
                  >
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    {t('product.sendMessage')}
                  </button>
                  <button
                    onClick={handleFollow}
                    className={`px-6 py-2.5 rounded-xl font-medium transition-all ${
                      isFollowing 
                        ? 'bg-gray-700 text-white hover:bg-gray-600' 
                        : 'bg-white text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {isFollowing ? t('seller.following') : t('seller.follow')}
                  </button>
                  <button
                    onClick={handleReport}
                    className="p-2.5 rounded-xl bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors"
                    title={t('seller.report')}
                  >
                    <FlagIcon className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 text-center">
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-3xl font-bold">{products.length}</p>
                <p className="text-gray-400 text-sm">{t('product.listings')}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-3xl font-bold">{seller.stats?.totalSales || 0}</p>
                <p className="text-gray-400 text-sm">{locale === 'en' ? 'Sales' : 'Satış'}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-3xl font-bold">{seller.stats?.totalTrades || 0}</p>
                <p className="text-gray-400 text-sm">{locale === 'en' ? 'Trade' : 'Takas'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          <button
            onClick={() => setTab('listings')}
            className={`pb-4 px-4 font-medium transition-colors ${
              tab === 'listings'
                ? 'text-primary-500 border-b-2 border-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('nav.listings')} ({products.length})
          </button>
          <button
            onClick={() => setTab('reviews')}
            className={`pb-4 px-4 font-medium transition-colors ${
              tab === 'reviews'
                ? 'text-primary-500 border-b-2 border-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('review.reviews')} ({seller.stats?.totalRatings || 0})
          </button>
        </div>

        {/* Listings Tab */}
        {tab === 'listings' && (
          <div>
            {products.length === 0 ? (
              <div className="text-center py-12">
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
                    <Link href={`/listings/${product.id}`} className="card overflow-hidden group">
                      <div className="relative aspect-square bg-gray-100">
                        <Image
                          src={getImageUrl(product.images)}
                          alt={product.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {product.isTradeEnabled && (
                          <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            <ArrowsRightLeftIcon className="w-3 h-3" />
                            {locale === 'en' ? 'Trade' : 'Takas'}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 line-clamp-2 text-sm group-hover:text-primary-500 transition-colors">
                          {product.title}
                        </h3>
                        <p className="text-primary-500 font-bold mt-1">
                          ₺{product.price.toLocaleString('tr-TR')}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reviews Tab */}
        {tab === 'reviews' && (
          <div className="text-center py-12">
            <StarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('common.comingSoon')}</p>
          </div>
        )}
      </div>

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={t('auth.authRequiredMessage')}
      />
    </div>
  );
}
