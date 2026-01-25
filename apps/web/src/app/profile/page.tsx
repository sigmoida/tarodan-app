'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { api, userApi, tradesApi, collectionsApi } from '@/lib/api';
import { useTranslation } from '@/i18n';

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
  const { t } = useTranslation();
  const { isAuthenticated, user, logout, refreshUserData } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user) {
      setProfileFromAuthStore();
    }
    loadProfile();
  }, [isAuthenticated]);

  const setProfileFromAuthStore = () => {
    if (!user) return;
    const tierType = user.membershipTier || 'free';
    
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
      const [profileResponse, statsResponse, ordersResponse, productsResponse, tradesResponse, collectionsResponse] = await Promise.all([
        userApi.getProfile().catch(() => null),
        userApi.getStats().catch(() => null),
        api.get('/orders', { params: { role: 'buyer', limit: 1 } }).catch(() => null),
        userApi.getMyProducts({ limit: 1 }).catch(() => null),
        tradesApi.getAll({ limit: 1 }).catch(() => null),
        collectionsApi.getMyCollections({ limit: 1 }).catch(() => null),
      ]);
      
      const profileData = profileResponse?.data?.user || profileResponse?.data || user;
      const statsData = statsResponse?.data?.data || statsResponse?.data || {};
      const ordersCount = ordersResponse?.data?.meta?.total || ordersResponse?.data?.data?.length || 0;
      const productsCount = productsResponse?.data?.meta?.total || productsResponse?.data?.data?.length || productsResponse?.data?.products?.length || 0;
      const tradesCount = tradesResponse?.data?.meta?.total || tradesResponse?.data?.data?.length || tradesResponse?.data?.trades?.length || 0;
      const collectionsCount = collectionsResponse?.data?.meta?.total || collectionsResponse?.data?.data?.length || collectionsResponse?.data?.collections?.length || 0;
      
      if (!profileData) return;
      
      const membershipFromApi = profileData.membership;
      const tierType = membershipFromApi?.tier?.type || profileData.membershipTier || user?.membershipTier || 'free';
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
      console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!isAuthenticated) return null;

  const tierColors = {
    free: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
    basic: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
    premium: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300' },
    business: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  };

  const currentTierColor = tierColors[profile?.membership?.tier.type as keyof typeof tierColors] || tierColors.free;

  // Quick action menu items
  const quickActions = [
    { icon: ShoppingBagIcon, label: t('nav.myListings'), href: '/profile/listings', color: 'text-orange-500' },
    { icon: TagIcon, label: t('order.myOrders'), href: '/orders', color: 'text-blue-500' },
    { icon: HeartIcon, label: t('nav.favorites'), href: '/wishlist', color: 'text-red-500' },
    { icon: ChatBubbleLeftRightIcon, label: t('nav.messages'), href: '/messages', color: 'text-green-500' },
  ];

  // Menu sections
  const menuSections = [
    {
      title: t('common.shopping'),
      items: [
        { icon: ShoppingBagIcon, label: t('nav.myListings'), href: '/profile/listings', desc: 'İlanlarınızı yönetin' },
        { icon: TagIcon, label: t('order.myOrders'), href: '/orders', desc: 'Sipariş geçmişiniz' },
        { icon: HeartIcon, label: t('nav.favorites'), href: '/wishlist', desc: 'Favori ürünleriniz' },
        { icon: ArrowsRightLeftIcon, label: t('trade.myTrades'), href: '/trades', desc: 'Takas teklifleriniz' },
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
        { icon: CreditCardIcon, label: t('payment.paymentMethods'), href: '/profile/payments', desc: 'Ödeme yöntemleriniz' },
        { icon: BellIcon, label: t('nav.notifications'), href: '/profile/notifications', desc: 'Bildirim ayarları' },
        { icon: ShieldCheckIcon, label: 'Güvenlik', href: '/profile/security', desc: 'Şifre ve güvenlik ayarları' },
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
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 pt-8 pb-24">
        <div className="max-w-5xl mx-auto px-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
          ) : profile && (
            <div className="flex items-center gap-6">
              {/* Avatar */}
              <div className="relative">
                <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center text-4xl font-bold text-orange-500 shadow-lg ring-4 ring-white/30">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    profile.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                {profile.isVerified && (
                  <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1.5 shadow-lg">
                    <CheckBadgeIcon className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
              
              {/* User Info */}
              <div className="flex-1 text-white">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl md:text-3xl font-bold">{profile.displayName}</h1>
                  {profile.membership && (
                    <span className={`px-3 py-1 text-xs rounded-full font-semibold bg-white/20 backdrop-blur-sm`}>
                      {profile.membership.tier.type === 'business' && '👑 '}
                      {profile.membership.tier.type === 'premium' && '⭐ '}
                      {profile.membership.tier.type === 'basic' && '🔷 '}
                      {profile.membership.tier.name}
                    </span>
                  )}
                </div>
                <p className="text-orange-100 mt-1">{profile.email}</p>
                <p className="text-orange-200 text-sm mt-1">
                  {t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString('tr-TR')}
                </p>
              </div>
              
              {/* Edit Button */}
              <Link
                href="/profile/edit"
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-white transition-colors"
              >
                <PencilSquareIcon className="w-5 h-5" />
                <span>{t('profile.editProfile')}</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 -mt-16">
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
              className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border border-gray-100 group"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-gray-50 group-hover:bg-orange-50 transition-colors`}>
                  <action.icon className={`w-6 h-6 ${action.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {action.label === t('nav.myListings') && (profile?.stats?.productsCount ?? 0)}
                    {action.label === t('order.myOrders') && (profile?.stats?.ordersCount ?? 0)}
                    {action.label === t('nav.favorites') && '—'}
                    {action.label === t('nav.messages') && '—'}
                  </p>
                  <p className="text-sm text-gray-500">{action.label}</p>
                </div>
              </div>
            </Link>
          ))}
        </motion.div>

        {/* Membership Card */}
        {profile?.membership && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${currentTierColor.bg}`}>
                  <SparklesIcon className={`w-6 h-6 ${currentTierColor.text}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{profile.membership.tier.name} Üyelik</h3>
                  <p className="text-sm text-gray-500">Mevcut planınız</p>
                </div>
              </div>
              {profile.membership.tier.type === 'free' && (
                <Link
                  href="/pricing"
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium rounded-xl transition-all shadow-sm hover:shadow-md"
                >
                  Yükselt
                </Link>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-orange-500">
                  {profile.membership.tier.maxTotalListings === -1 ? '∞' : profile.membership.tier.maxTotalListings}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('membership.listingsLimit')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-orange-500">{profile.membership.tier.maxImagesPerListing}</p>
                <p className="text-xs text-gray-500 mt-1">{t('product.images')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-orange-500">{profile.membership.tier.featuredListingSlots}</p>
                <p className="text-xs text-gray-500 mt-1">{t('membership.featuredListings')}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <p className="text-2xl font-bold text-green-500">
                  %{(profile.membership.tier.commissionDiscount * 100).toFixed(0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">{t('membership.savePercent')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                profile.membership.tier.canTrade 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-600'
              }`}>
                {profile.membership.tier.canTrade ? '✓' : '✗'} {t('nav.trades')}
              </span>
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                profile.membership.tier.canCreateCollections 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-600'
              }`}>
                {profile.membership.tier.canCreateCollections ? '✓' : '✗'} {t('nav.collections')}
              </span>
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                profile.membership.tier.isAdFree 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {profile.membership.tier.isAdFree ? '✓' : '✗'} {t('membership.noAds')}
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
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">{section.title}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {section.items.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="p-2 rounded-xl bg-gray-100 group-hover:bg-orange-100 transition-colors">
                      <item.icon className="w-5 h-5 text-gray-600 group-hover:text-orange-600 transition-colors" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-300 group-hover:text-orange-400 transition-colors" />
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
            className="w-full py-4 bg-white border border-red-200 text-red-600 font-medium rounded-2xl hover:bg-red-50 transition-colors shadow-sm"
          >
            {t('common.logout')}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
