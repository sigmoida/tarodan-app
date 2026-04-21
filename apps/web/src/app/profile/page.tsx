'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  UserCircleIcon,
  CogIcon,
  ShoppingBagIcon,
  HeartIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
  ArrowsRightLeftIcon,
  MapPinIcon,
  CreditCardIcon,
  ChartBarIcon,
  StarIcon,
  CheckBadgeIcon,
  PencilSquareIcon,
  ChevronRightIcon,
  SparklesIcon,
  RectangleStackIcon,
  BellIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  CurrencyDollarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Spinner } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import { api, userApi, tradesApi, collectionsApi, wishlistApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import UserAvatar from '@/components/UserAvatar';

interface MembershipTier {
  type: string;
  name: string;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  canTrade: boolean;
  canCreateCollections: boolean;
  featuredListingSlots: number;
  commissionDiscount: number;
  isAdFree: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  avatarUrl?: string;
  bio?: string;
  isSeller: boolean;
  isVerified: boolean;
  createdAt: string;
  addresses?: any[];
  stats?: {
    productsCount: number;
    ordersCount: number;
    tradesCount: number;
    collectionsCount: number;
    rating: number;
    reviewsCount: number;
  };
  membership?: {
    tier: MembershipTier;
    status: string;
    expiresAt: string | null;
  };
  membershipTier?: string;
}

const tierDefaults: Record<string, MembershipTier> = {
  free: { type: 'free', name: 'Ücretsiz', maxFreeListings: 5, maxTotalListings: 10, maxImagesPerListing: 3, canTrade: false, canCreateCollections: false, featuredListingSlots: 0, commissionDiscount: 0, isAdFree: false },
  basic: { type: 'basic', name: 'Temel', maxFreeListings: 15, maxTotalListings: 50, maxImagesPerListing: 6, canTrade: true, canCreateCollections: true, featuredListingSlots: 2, commissionDiscount: 0.5, isAdFree: false },
  premium: { type: 'premium', name: 'Premium', maxFreeListings: 50, maxTotalListings: 200, maxImagesPerListing: 10, canTrade: true, canCreateCollections: true, featuredListingSlots: 10, commissionDiscount: 1, isAdFree: true },
  business: { type: 'business', name: 'İş', maxFreeListings: 200, maxTotalListings: 1000, maxImagesPerListing: 15, canTrade: true, canCreateCollections: true, featuredListingSlots: 50, commissionDiscount: 1.5, isAdFree: true },
};

export default function ProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user, logout, refreshUserData } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const prevPathnameRef = useRef<string | null>(null);
  const [pendingCounts, setPendingCounts] = useState({ offers: 0, trades: 0 });

  useEffect(() => { setMounted(true); }, []);

  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const res = await wishlistApi.get();
      const data = res.data;
      const items = data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      return Array.isArray(items) ? items : [];
    },
    enabled: !authLoading && !!isAuthenticated,
    meta: { page: 'profile-wishlist-count' },
  });
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile');
      return;
    }
    if (user) {
      setProfileFromAuthStore();
    }
    loadProfile();
  }, [mounted, isAuthenticated, authLoading, router]);

  // Refresh profile when pathname changes (e.g., returning from edit/delete page)
  useEffect(() => {
    if (prevPathnameRef.current !== null && prevPathnameRef.current !== pathname && pathname === '/profile' && isAuthenticated) {
      // Page was navigated to, refresh profile
      loadProfile();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, isAuthenticated]);

  // Refresh profile when page becomes visible (e.g., after deleting a listing)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated) {
        loadProfile();
      }
    };

    const handleFocus = () => {
      if (isAuthenticated) {
        loadProfile();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated]);

  const setProfileFromAuthStore = () => {
    if (!user) return;
    const tierType = user.membershipTier || 'free';
    const tierDefaults: Record<string, MembershipTier> = {
      free: { type: 'free', name: 'Ücretsiz', maxFreeListings: 5, maxTotalListings: 10, maxImagesPerListing: 3, canTrade: false, canCreateCollections: false, featuredListingSlots: 0, commissionDiscount: 0, isAdFree: false },
      basic: { type: 'basic', name: 'Temel', maxFreeListings: 15, maxTotalListings: 50, maxImagesPerListing: 6, canTrade: true, canCreateCollections: true, featuredListingSlots: 2, commissionDiscount: 0.5, isAdFree: false },
      premium: { type: 'premium', name: 'Premium', maxFreeListings: 50, maxTotalListings: 200, maxImagesPerListing: 10, canTrade: true, canCreateCollections: true, featuredListingSlots: 10, commissionDiscount: 1, isAdFree: true },
      business: { type: 'business', name: 'İş', maxFreeListings: 200, maxTotalListings: 1000, maxImagesPerListing: 15, canTrade: true, canCreateCollections: true, featuredListingSlots: 50, commissionDiscount: 1.5, isAdFree: true },
    };
    
    setProfile({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isVerified: user.isVerified,
      isSeller: user.isSeller,
      createdAt: String(user.createdAt),
      membershipTier: tierType,
      membership: {
        tier: tierDefaults[tierType] || tierDefaults.free,
        status: 'active',
        expiresAt: null,
      },
      stats: {
        productsCount: user.listingCount || 0,
        ordersCount: user.totalPurchases || 0,
        tradesCount: 0,
        collectionsCount: 0,
        rating: user.rating || 0,
        reviewsCount: user.totalRatings || 0,
      },
    });
    setLoading(false);
  };

  const loadProfile = async () => {
    try {
      const [profileResponse, statsResponse, ordersResponse, productsResponse, tradesResponse, collectionsResponse, offersPendingResponse, tradesPendingResponse] = await Promise.all([
        userApi.getProfile().catch(() => null),
        userApi.getStats().catch(() => null),
        api.get('/orders', { params: { role: 'buyer', limit: 1 } }).catch(() => null),
        userApi.getMyProducts({ limit: 100, _t: Date.now() }).catch(() => null), // Get more products to filter properly
        tradesApi.getAll({ limit: 1 }).catch(() => null),
        collectionsApi.getMyCollections({ limit: 1 }).catch(() => null),
        api.get('/offers/pending-count').catch(() => null),
        api.get('/trades/pending-count').catch(() => null),
      ]);
      
      // Set pending counts for badges
      setPendingCounts({
        offers: offersPendingResponse?.data?.received || 0,
        trades: tradesPendingResponse?.data?.received || 0,
      });
      
      const profileData = profileResponse?.data?.user || profileResponse?.data || user;
      const statsData = statsResponse?.data?.data || statsResponse?.data || {};
      const ordersCount = ordersResponse?.data?.meta?.total || ordersResponse?.data?.data?.length || 0;
      
      // Calculate productsCount by filtering out deleted/inactive listings
      let productsCount = 0;
      if (productsResponse?.data) {
        const products = productsResponse.data?.data || productsResponse.data?.products || [];
        // Filter out deleted, inactive, and draft listings
        productsCount = products.filter((p: any) => 
          p.status !== 'deleted' && 
          p.status !== 'inactive' && 
          p.status !== 'draft'
        ).length;
      } else {
        // Fallback to meta total if available
        productsCount = productsResponse?.data?.meta?.total || 0;
      }
      const tradesCount = tradesResponse?.data?.meta?.total || tradesResponse?.data?.data?.length || tradesResponse?.data?.trades?.length || 0;
      const collectionsCount = collectionsResponse?.data?.meta?.total || collectionsResponse?.data?.data?.length || collectionsResponse?.data?.collections?.length || 0;
      
      if (!profileData) return;
      
      const membershipFromApi = profileData.membership;
      const tierType = membershipFromApi?.tier?.type || profileData.membershipTier || user?.membershipTier || 'free';
      
      // Build membership tier object
      const tierDefaults: Record<string, MembershipTier> = {
        free: { type: 'free', name: 'Ücretsiz', maxFreeListings: 5, maxTotalListings: 10, maxImagesPerListing: 3, canTrade: false, canCreateCollections: false, featuredListingSlots: 0, commissionDiscount: 0, isAdFree: false },
        premium: { type: 'premium', name: 'Premium', maxFreeListings: -1, maxTotalListings: -1, maxImagesPerListing: 15, canTrade: true, canCreateCollections: true, featuredListingSlots: 3, commissionDiscount: 1, isAdFree: true },
        business: { type: 'business', name: 'İş', maxFreeListings: 200, maxTotalListings: 1000, maxImagesPerListing: 15, canTrade: true, canCreateCollections: true, featuredListingSlots: 50, commissionDiscount: 1.5, isAdFree: true },
      };
      
      const tierInfo = membershipFromApi?.tier || tierDefaults[tierType] || tierDefaults.free;
      
      setProfile({
        ...profileData,
        displayName: profileData.displayName || profileData.display_name || user?.displayName || '',
        isVerified: profileData.isVerified || profileData.is_verified || user?.isVerified || false,
        isSeller: profileData.isSeller || profileData.is_seller || user?.isSeller || false,
        createdAt: profileData.createdAt || profileData.created_at || user?.createdAt || new Date().toISOString(),
        membershipTier: tierType,
        membership: {
          tier: tierInfo,
          status: membershipFromApi?.status || 'active',
          expiresAt: membershipFromApi?.expiresAt || null,
        },
        stats: {
          productsCount: productsCount || profileData.listingCount || (statsData.productsCount ?? 0),
          ordersCount: ordersCount || (statsData.ordersCount ?? 0),
          tradesCount: tradesCount || (statsData.tradesCount ?? 0),
          collectionsCount: collectionsCount || (statsData.collectionsCount ?? 0),
          rating: statsData.rating ?? profileData.rating ?? user?.rating ?? 0,
          reviewsCount: statsData.reviewsCount ?? statsData.totalRatings ?? user?.totalRatings ?? 0,
        },
      });
      
      refreshUserData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!mounted || authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-primary-500 pt-8 pb-24">
          <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16">
            <div className="flex justify-center py-12">
              <Spinner size="xl" color="border-white border-t-transparent" />
            </div>
          </div>
        </div>
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 -mt-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded p-5 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-12 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const tierColors = {
    free: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
    basic: { bg: 'bg-info-50', text: 'text-info-700', border: 'border-info-300' },
    premium: { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-300' },
    business: { bg: 'bg-warning-50', text: 'text-warning-700', border: 'border-warning-300' },
  };

  const currentTierColor = tierColors[profile?.membership?.tier.type as keyof typeof tierColors] || tierColors.free;

  // Quick action menu items
  const quickActions = [
    { icon: ShoppingBagIcon, label: t('nav.myListings'), href: '/profile/listings', color: 'text-primary-500' },
    { icon: TagIcon, label: t('order.myOrders'), href: '/orders', color: 'text-info-500' },
    { icon: HeartIcon, label: t('nav.favorites'), href: '/favorites', color: 'text-danger-500' },
    { icon: ChatBubbleLeftRightIcon, label: t('nav.messages'), href: '/messages', color: 'text-success-500' },
  ];

  // Menu sections
  const menuSections = [
    {
      title: t('common.shopping'),
      items: [
        { icon: ShoppingBagIcon, label: t('nav.myListings'), href: '/profile/listings', desc: 'İlanlarınızı yönetin' },
        { icon: ChartBarIcon, label: t('sellerDashboard.title'), href: '/seller/dashboard', desc: t('sellerDashboard.subtitle') },
        { icon: TagIcon, label: t('order.myOrders'), href: '/orders', desc: 'Sipariş geçmişiniz' },
        { icon: CurrencyDollarIcon, label: t('offer.myOffers'), href: '/offers', desc: 'Teklif yönetimi', badge: pendingCounts.offers },
        { icon: HeartIcon, label: t('nav.favorites'), href: '/favorites', desc: 'Favori ürünleriniz' },
        { icon: ArrowsRightLeftIcon, label: t('trade.myTrades'), href: '/trades', desc: 'Takas teklifleriniz' },
        { icon: SparklesIcon, label: t('membership.title'), href: '/profile/membership', desc: 'Üyelik planınızı yönetin' },
      ],
    },
    {
      title: t('nav.collections'),
      items: [
        { icon: RectangleStackIcon, label: t('collection.myCollections'), href: '/collections', desc: 'Koleksiyonlarınız' },
        { icon: StarIcon, label: 'Beğenilen Koleksiyonlar', href: '/collections/liked', desc: 'Beğendiğiniz koleksiyonlar' },
      ],
    },
    {
      title: t('profile.accountSettings'),
      items: [
        { icon: UserCircleIcon, label: t('profile.editProfile'), href: '/profile/edit', desc: 'Profil bilgilerinizi düzenleyin' },
        { icon: MapPinIcon, label: t('address.myAddresses'), href: '/profile/addresses', desc: 'Teslimat adresleriniz' },
        { icon: CreditCardIcon, label: t('payment.paymentMethods'), href: '/payment-methods', desc: 'Kayıtlı kartlarınız' },
        { icon: ClockIcon, label: t('payment.history'), href: '/profile/payments', desc: 'Ödeme geçmişiniz' },
        { icon: BellIcon, label: t('nav.notifications'), href: '/notifications', desc: 'Bildirim ayarları' },
        { icon: ShieldCheckIcon, label: 'Güvenlik', href: '/profile/change-password', desc: 'Şifre ve güvenlik ayarları' },
      ],
    },
    {
      title: t('common.more'),
      items: [
        { icon: ChartBarIcon, label: t('analytics.analytics'), href: '/profile/statistics', desc: 'Satış ve görüntüleme istatistikleri' },
        { icon: DocumentTextIcon, label: t('footer.support'), href: '/support', desc: 'Yardım ve destek' },
        { icon: CogIcon, label: t('nav.settings'), href: '/profile/settings', desc: 'Uygulama ayarları' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 pt-8 pb-24">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="xl" color="border-white border-t-transparent" />
            </div>
          ) : profile && (
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {/* Avatar: initials only (Trendyol-style) */}
              <div className="relative flex-shrink-0">
                <UserAvatar displayName={profile.displayName} avatarUrl={profile.avatarUrl} size="xl" ring className="bg-white text-primary-500 shadow-lg" />
              </div>
              
              {/* User Info */}
              <div className="flex-1 text-white min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-bold truncate">{profile.displayName}</h1>
                  {profile.isVerified && (
                    <span className="px-2 py-1 bg-success-500/30 text-success-100 text-xs rounded-sm font-medium whitespace-nowrap">
                      ✓ {t('common.approved')}
                    </span>
                  )}
                </div>
                
                {/* Membership Badge - Ayrı satırda daha okunabilir */}
                {profile.membership && (
                  <div className="mb-3">
                    <span className={`inline-flex items-center px-4 py-1.5 text-sm rounded-sm font-semibold ${
                      profile.membership.tier.type === 'business' 
                        ? 'bg-gradient-to-r from-warning-400 to-primary-400 text-white shadow-md' 
                        : profile.membership.tier.type === 'premium'
                          ? 'bg-gradient-to-r from-primary-400 to-danger-400 text-white shadow-md'
                          : 'bg-white/25 backdrop-blur-sm text-white'
                    }`}>
                      {profile.membership.tier.type === 'business' && <span className="mr-1">👑</span>}
                      {profile.membership.tier.type === 'premium' && <span className="mr-1">⭐</span>}
                      {profile.membership.tier.type === 'free' && <span className="mr-1">🆓</span>}
                      {profile.membership.tier.name}
                    </span>
                  </div>
                )}
                
                <p className="text-primary-100">{profile.email}</p>
                <p className="text-primary-200 text-sm mt-1">
                  {t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString('tr-TR')}
                </p>
                
                {/* Rating - Header'da göster */}
                {profile.stats && profile.stats.rating > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex text-warning-300">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className={`w-4 h-4 ${star <= (profile.stats?.rating ?? 0) ? 'fill-current' : 'text-white/30'}`}
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-white font-medium">{profile.stats.rating.toFixed(1)}</span>
                    <span className="text-primary-200 text-sm">({profile.stats.reviewsCount} değerlendirme)</span>
                  </div>
                )}
              </div>
              
              {/* Edit Button */}
              <Link
                href="/profile/edit"
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded text-white text-sm font-medium transition-colors flex-shrink-0"
              >
                <PencilSquareIcon className="w-5 h-5" />
                <span>{t('profile.editProfile')}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 -mt-16">
        {/* Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
        >
          {quickActions.map((action, i) => (
            <Link
              key={action.label}
              href={action.href}
              className="bg-white rounded p-5 shadow-sm hover:shadow-md transition-all border border-gray-100 group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded bg-gray-50 group-hover:bg-primary-50 transition-colors`}>
                  <action.icon className={`w-6 h-6 ${action.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {action.label === t('nav.myListings') && (profile?.stats?.productsCount ?? 0)}
                    {action.label === t('order.myOrders') && (profile?.stats?.ordersCount ?? 0)}
                    {action.label === t('nav.favorites') && wishlistCount}
                    {action.label === t('nav.messages') && '—'}
                  </p>
                  <p className="text-sm text-gray-500">{action.label}</p>
                </div>
              </div>
            </Link>
          ))}
        </motion.div>

        {/* Membership Card - Temiz ve Profesyonel */}
        {profile?.membership && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`rounded p-6 shadow-sm border mb-6 ${
              profile.membership.tier.type === 'business' 
                ? 'bg-gradient-to-br from-warning-50 to-primary-50 border-warning-200' 
                : profile.membership.tier.type === 'premium'
                  ? 'bg-gradient-to-br from-primary-50 to-danger-50 border-primary-200'
                  : 'bg-white border-gray-100'
            }`}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded ${
                  profile.membership.tier.type === 'business'
                    ? 'bg-gradient-to-br from-warning-400 to-primary-500 text-white'
                    : profile.membership.tier.type === 'premium'
                      ? 'bg-gradient-to-br from-primary-400 to-danger-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  <SparklesIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">
                    {profile.membership.tier.type === 'business' && '👑 '}
                    {profile.membership.tier.type === 'premium' && '⭐ '}
                    {profile.membership.tier.type === 'free' && '🆓 '}
                    {profile.membership.tier.name}
                  </h3>
                  <p className="text-sm text-gray-500">Mevcut planınız</p>
                </div>
              </div>
              {profile.membership.tier.type === 'free' && (
                <Link
                  href="/pricing"
                  className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded transition-colors"
                >
                  🚀 Premium'a Yükselt
                </Link>
              )}
            </div>
            
            {/* Plan Özellikleri Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div className={`text-center p-4 rounded ${
                profile.membership.tier.type === 'free' ? 'bg-gray-50' : 'bg-white/60'
              }`}>
                <p className={`text-2xl font-bold ${
                  profile.membership.tier.type === 'business' ? 'text-warning-600' :
                  profile.membership.tier.type === 'premium' ? 'text-primary-600' : 'text-primary-500'
                }`}>
                  {(() => {
                    const limit = profile.membership.tier.type === 'free'
                      ? profile.membership.tier.maxFreeListings
                      : profile.membership.tier.maxTotalListings;
                    return limit === -1 ? '∞' : limit;
                  })()}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-medium">{t('membership.listingsLimit')}</p>
              </div>
              <div className={`text-center p-4 rounded ${
                profile.membership.tier.type === 'free' ? 'bg-gray-50' : 'bg-white/60'
              }`}>
                <p className={`text-2xl font-bold ${
                  profile.membership.tier.type === 'business' ? 'text-warning-600' :
                  profile.membership.tier.type === 'premium' ? 'text-primary-600' : 'text-primary-500'
                }`}>{profile.membership.tier.maxImagesPerListing}</p>
                <p className="text-xs text-gray-600 mt-1 font-medium">Fotoğraf / İlan</p>
              </div>
              <div className={`text-center p-4 rounded ${
                profile.membership.tier.type === 'free' ? 'bg-gray-50' : 'bg-white/60'
              }`}>
                <p className={`text-2xl font-bold ${
                  profile.membership.tier.type === 'business' ? 'text-warning-600' :
                  profile.membership.tier.type === 'premium' ? 'text-primary-600' : 'text-primary-500'
                }`}>{profile.membership.tier.featuredListingSlots}</p>
                <p className="text-xs text-gray-600 mt-1 font-medium">{t('membership.featuredListings')}</p>
              </div>
              <div className={`text-center p-4 rounded ${
                profile.membership.tier.type === 'free' ? 'bg-gray-50' : 'bg-white/60'
              }`}>
                <p className="text-2xl font-bold text-success-500">
                  %{(profile.membership.tier.commissionDiscount * 100).toFixed(0)}
                </p>
                <p className="text-xs text-gray-600 mt-1 font-medium">Komisyon İndirimi</p>
              </div>
            </div>
            
            {/* Özellik Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1.5 rounded-sm text-xs font-medium ${
                profile.membership.tier.canTrade 
                  ? 'bg-success-100 text-success-700 border border-success-200' 
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {profile.membership.tier.canTrade ? '✓' : '✗'} Takas
              </span>
              <span className={`px-3 py-1.5 rounded-sm text-xs font-medium ${
                profile.membership.tier.canCreateCollections 
                  ? 'bg-success-100 text-success-700 border border-success-200' 
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {profile.membership.tier.canCreateCollections ? '✓' : '✗'} Koleksiyon
              </span>
              <span className={`px-3 py-1.5 rounded-sm text-xs font-medium ${
                profile.membership.tier.isAdFree 
                  ? 'bg-success-100 text-success-700 border border-success-200' 
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {profile.membership.tier.isAdFree ? '✓ Reklamsız' : '✗ Reklamsız'}
              </span>
            </div>
          </motion.div>
        )}

        {/* Menu Sections */}
        <div className="space-y-6 pb-8">
          {menuSections.map((section, sectionIndex) => (
            <motion.div 
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + sectionIndex * 0.05 }}
              className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">{section.title}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {section.items
                  .filter((item: any) => !item.sellerOnly || profile?.isSeller)
                  .map((item: any) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="relative p-2 rounded bg-gray-100 group-hover:bg-primary-100 transition-colors">
                      <item.icon className="w-5 h-5 text-gray-600 group-hover:text-primary-600 transition-colors" />
                      {item.badge > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger-500 text-white text-xs font-bold rounded-sm flex items-center justify-center">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{item.label}</p>
                        {item.badge > 0 && (
                          <span className="px-2 py-0.5 bg-danger-100 text-danger-600 text-xs font-medium rounded-sm">
                            {item.badge} bekliyor
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-primary-400 transition-colors" />
                  </Link>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Logout Button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onClick={handleLogout}
            className="w-full py-4 bg-white border border-danger-200 text-danger-600 font-medium rounded hover:bg-danger-50 transition-colors shadow-sm"
          >
            {t('common.logout')}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
