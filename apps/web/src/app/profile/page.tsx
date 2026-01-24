'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { api, userApi } from '@/lib/api';

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

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, logout, refreshUserData } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    // First use authStore user data immediately, then refresh
    if (user) {
      setProfileFromAuthStore();
    }
    loadProfile();
  }, [isAuthenticated]);

  const setProfileFromAuthStore = () => {
    if (!user) return;
    
    // Get membership tier info
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
      // Use /users/me for profile data
      const [profileResponse, statsResponse, ordersResponse, productsResponse] = await Promise.all([
        userApi.getProfile().catch(() => null),
        userApi.getStats().catch(() => null),
        api.get('/orders', { params: { role: 'buyer', limit: 1 } }).catch(() => null),
        userApi.getMyProducts({ limit: 1 }).catch(() => null),
      ]);
      
      const profileData = profileResponse?.data?.user || profileResponse?.data || user;
      const statsData = statsResponse?.data?.data || statsResponse?.data || {};
      const ordersCount = ordersResponse?.data?.meta?.total || ordersResponse?.data?.data?.length || 0;
      const productsCount = productsResponse?.data?.meta?.total || productsResponse?.data?.data?.length || productsResponse?.data?.products?.length || 0;
      
      if (!profileData) {
        // If no profile data, keep using authStore data
        return;
      }
      
      // Get membership info from API response
      const membershipFromApi = profileData.membership;
      const tierType = membershipFromApi?.tier?.type || profileData.membershipTier || user?.membershipTier || 'free';
      
      // Build membership tier object
      const tierDefaults: Record<string, MembershipTier> = {
        free: { type: 'free', name: 'Ücretsiz', maxFreeListings: 5, maxTotalListings: 10, maxImagesPerListing: 3, canTrade: false, canCreateCollections: false, featuredListingSlots: 0, commissionDiscount: 0, isAdFree: false },
        basic: { type: 'basic', name: 'Temel', maxFreeListings: 15, maxTotalListings: 50, maxImagesPerListing: 6, canTrade: true, canCreateCollections: true, featuredListingSlots: 2, commissionDiscount: 0.5, isAdFree: false },
        premium: { type: 'premium', name: 'Premium', maxFreeListings: 50, maxTotalListings: 200, maxImagesPerListing: 10, canTrade: true, canCreateCollections: true, featuredListingSlots: 10, commissionDiscount: 1, isAdFree: true },
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
          productsCount: productsCount || profileData.listingCount || (statsData.productsCount ?? statsData.listings ?? statsData.products ?? 
                        profileData._count?.products ?? user?.listingCount ?? 0),
          ordersCount: ordersCount || (statsData.ordersCount ?? statsData.orders ?? 
                      profileData._count?.orders ?? user?.totalPurchases ?? 0),
          tradesCount: statsData.tradesCount ?? statsData.trades ?? 
                      profileData._count?.trades ?? 0,
          collectionsCount: statsData.collectionsCount ?? statsData.collections ?? 
                           profileData._count?.collections ?? 0,
          rating: statsData.rating ?? profileData.rating ?? user?.rating ?? 0,
          reviewsCount: statsData.reviewsCount ?? statsData.totalRatings ?? user?.totalRatings ?? 0,
        },
      });
      
      // Also refresh authStore user data
      refreshUserData();
    } catch (error) {
      console.error('Profile load error:', error);
      // Fallback to auth store user data already set
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : profile ? (
          <div className="space-y-8">
            {/* Profile Header */}
            <div className="bg-gray-800 rounded-xl p-6">
              <div className="flex items-start gap-6">
                <div className="w-24 h-24 bg-primary-500/20 rounded-full flex items-center justify-center text-4xl">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.displayName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    profile.displayName.charAt(0)
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold">{profile.displayName}</h1>
                    {profile.isVerified && (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
                        ✓ Doğrulanmış
                      </span>
                    )}
                    {profile.membership && (
                      <span className={`px-3 py-1 text-xs rounded-full font-semibold ${
                        profile.membership.tier.type === 'business' 
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' 
                          : profile.membership.tier.type === 'premium'
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                            : profile.membership.tier.type === 'basic'
                              ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                              : 'bg-gray-600 text-gray-200'
                      }`}>
                        {profile.membership.tier.type === 'business' && '👑 '}
                        {profile.membership.tier.type === 'premium' && '⭐ '}
                        {profile.membership.tier.type === 'basic' && '🔷 '}
                        {profile.membership.tier.name}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 mt-1">{profile.email}</p>
                  {profile.bio && <p className="text-gray-300 mt-2">{profile.bio}</p>}
                  <p className="text-gray-500 text-sm mt-2">
                    Üye olma: {new Date(profile.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <Link
                  href="/profile/edit"
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Profili Düzenle
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'İlanlarım', value: profile.stats?.productsCount ?? 0, href: '/profile/listings' },
                { label: 'Siparişlerim', value: profile.stats?.ordersCount ?? 0, href: '/orders' },
                { label: 'Takaslarım', value: profile.stats?.tradesCount ?? 0, href: '/trades' },
                { label: 'Koleksiyonlarım', value: profile.stats?.collectionsCount ?? 0, href: '/collections' },
              ].map((stat) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className="bg-gray-800 rounded-xl p-4 hover:bg-gray-750 transition-colors"
                >
                  <p className="text-3xl font-bold text-primary-400">{stat.value}</p>
                  <p className="text-gray-400">{stat.label}</p>
                </Link>
              ))}
            </div>

            {/* Rating */}
            {profile.stats && profile.stats.rating > 0 && (
              <div className="bg-gray-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4">Değerlendirmelerim</h2>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-yellow-400">
                    {profile.stats.rating.toFixed(1)}
                  </div>
                  <div>
                    <div className="flex text-yellow-400">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <svg
                          key={star}
                          className={`w-6 h-6 ${
                            star <= (profile.stats?.rating ?? 0) ? 'fill-current' : 'text-gray-600'
                          }`}
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-gray-400 text-sm">{profile.stats?.reviewsCount ?? 0} değerlendirme</p>
                  </div>
                </div>
              </div>
            )}

            {/* Membership Features */}
            {profile.membership && (
              <div className={`rounded-xl p-6 ${
                profile.membership.tier.type === 'business' 
                  ? 'bg-gradient-to-br from-orange-900/30 to-amber-900/30 border border-orange-500/30' 
                  : profile.membership.tier.type === 'premium'
                    ? 'bg-gradient-to-br from-purple-900/30 to-pink-900/30 border border-purple-500/30'
                    : profile.membership.tier.type === 'basic'
                      ? 'bg-gradient-to-br from-blue-900/30 to-cyan-900/30 border border-blue-500/30'
                      : 'bg-gray-800'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    {profile.membership.tier.type === 'business' && '👑'}
                    {profile.membership.tier.type === 'premium' && '⭐'}
                    {profile.membership.tier.type === 'basic' && '🔷'}
                    {profile.membership.tier.name}
                  </h2>
                  {profile.membership.tier.type === 'free' && (
                    <Link
                      href="/pricing"
                      className="px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-sm font-medium transition-colors"
                    >
                      Yükselt
                    </Link>
                  )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <p className="text-2xl font-bold text-primary-400">
                      {profile.membership.tier.maxTotalListings === -1 ? '∞' : profile.membership.tier.maxTotalListings}
                    </p>
                    <p className="text-xs text-gray-400">Maks İlan</p>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <p className="text-2xl font-bold text-primary-400">{profile.membership.tier.maxImagesPerListing}</p>
                    <p className="text-xs text-gray-400">İlan Başı Resim</p>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <p className="text-2xl font-bold text-primary-400">{profile.membership.tier.featuredListingSlots}</p>
                    <p className="text-xs text-gray-400">Öne Çıkan Slot</p>
                  </div>
                  <div className="text-center p-3 bg-black/20 rounded-lg">
                    <p className="text-2xl font-bold text-green-400">
                      %{(profile.membership.tier.commissionDiscount * 100).toFixed(1).replace('.0', '')}
                    </p>
                    <p className="text-xs text-gray-400">Komisyon İndirimi</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    profile.membership.tier.canTrade 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {profile.membership.tier.canTrade ? '✓' : '✗'} Takas
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    profile.membership.tier.canCreateCollections 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {profile.membership.tier.canCreateCollections ? '✓' : '✗'} Koleksiyon
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    profile.membership.tier.isAdFree 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {profile.membership.tier.isAdFree ? '✓ Reklamsız' : 'Reklamlı'}
                  </span>
                </div>
              </div>
            )}

            {/* Business Dashboard - Only for business accounts */}
            {profile.membership?.tier.type === 'business' && (
              <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      📊 İşletme Paneli
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                      Ürün ve koleksiyon istatistiklerinizi görüntüleyin
                    </p>
                  </div>
                  <Link
                    href="/profile/business"
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                  >
                    Paneli Aç →
                  </Link>
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Hızlı Erişim</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Mesajlarım', href: '/messages', icon: '💬' },
                  { label: 'Favorilerim', href: '/wishlist', icon: '❤️' },
                  { label: 'Takip Ettiklerim', href: '/profile/following', icon: '👥' },
                  { label: 'Üyelik', href: '/pricing', icon: '⭐' },
                  { label: 'Destek', href: '/support', icon: '🎫' },
                  { label: 'Adreslerim', href: '/profile/addresses', icon: '📍' },
                  { label: 'Ödeme Geçmişi', href: '/profile/payments', icon: '💳' },
                  { label: 'İstatistikler', href: '/profile/statistics', icon: '📈' },
                  { label: 'Ayarlar', href: '/profile/settings', icon: '⚙️' },
                  ...(profile.membership?.tier.type === 'business' ? [
                    { label: 'İşletme Paneli', href: '/profile/business', icon: '📊' }
                  ] : []),
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
            >
              Çıkış Yap
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">Profil yüklenemedi</p>
          </div>
        )}
      </main>
    </div>
  );
}
