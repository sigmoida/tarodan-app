'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  UserCircleIcon,
  ArrowsRightLeftIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  PlusIcon,
  ShoppingBagIcon,
  TagIcon,
  MapPinIcon,
  CogIcon,
  ArrowRightOnRectangleIcon,
  CurrencyDollarIcon,
  SparklesIcon,
  ChevronDownIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi, api, wishlistApi } from '@/lib/api';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/LanguageContext';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';

export default function Navbar() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { itemCount: cartCount } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [pendingTradesCount, setPendingTradesCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { addSearch, searches: recentSearches } = useRecentSearchesStore();
  const [topAds, setTopAds] = useState<Array<{
    id: string;
    title: string;
    imageUrl: string | null;
    linkUrl: string | null;
    content: string | null;
    altText: string | null;
    width: number | null;
    height: number | null;
    deviceType: string;
  }>>([]);
  const recordedImpressions = useRef<Set<string>>(new Set());
  const [adImageError, setAdImageError] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  // Defer auth-dependent UI until after hydration so server and first client render always match (avoids hydration error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showAuthUI = mounted && isAuthenticated;

  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const res = await wishlistApi.get();
      const data = res.data;
      const items = data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      return Array.isArray(items) ? items : [];
    },
    enabled: showAuthUI,
    meta: { page: 'navbar-wishlist-count' },
  });
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  const NAV_LINKS = [
    { href: '/listings', label: t('nav.listings') },
    { href: '/brands', label: t('nav.brands') || 'Markalar' },
    { href: '/trades', label: t('nav.trades') },
    { href: '/collections', label: t('nav.collections') },
    { href: '/pricing', label: t('nav.pricing') },
  ];

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      addSearch(trimmed);
      setSearchQuery('');
      setShowSearchDropdown(false);
      router.push(`/listings?search=${encodeURIComponent(trimmed)}`);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadMessageCount();
      fetchPendingCounts();
      // Poll for new messages and pending counts every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadMessageCount();
        fetchPendingCounts();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadMessageCount(0);
      setPendingOffersCount(0);
      setPendingTradesCount(0);
    }
  }, [isAuthenticated]);

  const fetchUnreadMessageCount = async () => {
    try {
      const response = await messagesApi.getThreads();
      const threads = response.data.data || response.data.threads || [];
      const totalUnread = threads.reduce((sum: number, thread: any) => {
        return sum + (thread.unreadCount || 0);
      }, 0);
      setUnreadMessageCount(totalUnread);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch unread message count:', error);
    }
  };

  const fetchPendingCounts = async () => {
    try {
      const [offersRes, tradesRes] = await Promise.all([
        api.get('/offers/pending-count').catch(() => null),
        api.get('/trades/pending-count').catch(() => null),
      ]);
      setPendingOffersCount(offersRes?.data?.received || 0);
      setPendingTradesCount(tradesRes?.data?.received || 0);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch pending counts:', error);
    }
  };

  // Premium ve Business üyeler için reklam gösterme
  const membershipTier = user?.membershipTier || 'free';
  const isAdFree = membershipTier === 'premium' || membershipTier === 'business';
  const shouldShowAd = !isAdFree;

  // Detect mobile/desktop for responsive ads
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch active top ads (public API, no auth) - with device type
  useEffect(() => {
    if (!shouldShowAd) return;
    const deviceType = isMobile ? 'mobile' : 'desktop';
    api.get<Array<{
      id: string;
      title: string;
      imageUrl: string | null;
      linkUrl: string | null;
      content: string | null;
      altText: string | null;
      width: number | null;
      height: number | null;
      deviceType: string;
    }>>('/ads/active', { params: { position: 'header', device: deviceType } })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTopAds(list);
        setAdImageError(new Set());
      })
      .catch((err) => {
        if (process.env.NODE_ENV === 'development') console.error('Failed to fetch ads:', err);
        setTopAds([]);
      });
  }, [shouldShowAd, isMobile]);

  // Record impression once per ad when bar is shown
  useEffect(() => {
    if (topAds.length === 0) return;
    topAds.forEach((ad) => {
      if (recordedImpressions.current.has(ad.id)) return;
      recordedImpressions.current.add(ad.id);
      api.post(`/ads/${ad.id}/impression`).catch(() => { });
    });
  }, [topAds]);

  const handleAdClick = (ad: { id: string; linkUrl: string | null }) => {
    api.post(`/ads/${ad.id}/click`).catch(() => { });
    if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAdImageError = (adId: string) => {
    setAdImageError((prev) => new Set(prev).add(adId));
  };

  return (
    <>
      {/* Slim Top Bar - Image Marquee (50px / 40px mobile) */}
      {shouldShowAd && (
        <>
          {topAds.length > 0 ? (
            <div
              className="w-full relative flex items-center overflow-hidden border-b border-gray-700"
              style={{
                height: isMobile ? 40 : 50,
                maxHeight: 60,
                backgroundColor: '#1f2937',
              }}
              role="region"
              aria-label="Reklam alanı"
            >
              {/* Marquee: bir set reklam + viewport boşluğu + tekrar aynı set → aynı anda tek logo görünür */}
              <div className="ad-marquee-track flex flex-nowrap items-center flex-shrink-0 gap-8 h-full pr-8">
                {topAds.map((ad, index) => (
                  <button
                    key={`a-${ad.id}-${index}`}
                    type="button"
                    onClick={() => handleAdClick(ad)}
                    className="flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity"
                    style={{ height: isMobile ? 40 : 50 }}
                    aria-label={ad.altText || ad.title}
                  >
                    {ad.imageUrl && !adImageError.has(ad.id) ? (
                      <img
                        src={ad.imageUrl}
                        alt={ad.altText || ad.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]"
                        style={{ maxHeight: isMobile ? 40 : 50 }}
                        onError={() => handleAdImageError(ad.id)}
                      />
                    ) : (
                      <span className="text-orange-400 text-xs font-medium px-4 whitespace-nowrap">
                        {ad.title}
                      </span>
                    )}
                  </button>
                ))}
                {/* İki set arasında en az viewport genişliği boşluk → ikinci logo ekranda çıkana kadar birinci kayar */}
                <div className="flex-shrink-0 h-full" style={{ minWidth: '100vw' }} aria-hidden />
                {topAds.map((ad, index) => (
                  <button
                    key={`b-${ad.id}-${index}`}
                    type="button"
                    onClick={() => handleAdClick(ad)}
                    className="flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity"
                    style={{ height: isMobile ? 40 : 50 }}
                    aria-label={ad.altText || ad.title}
                  >
                    {ad.imageUrl && !adImageError.has(ad.id) ? (
                      <img
                        src={ad.imageUrl}
                        alt={ad.altText || ad.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]"
                        style={{ maxHeight: isMobile ? 40 : 50 }}
                        onError={() => handleAdImageError(ad.id)}
                      />
                    ) : (
                      <span className="text-orange-400 text-xs font-medium px-4 whitespace-nowrap">
                        {ad.title}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {/* Sponsorlu badge - sol üst */}
              <span
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-[9px] text-gray-500 opacity-60 select-none pointer-events-none"
                aria-hidden
              >
                Sponsorlu
              </span>
            </div>
          ) : (
            <div
              className="w-full flex items-center justify-center border-b border-gray-700 text-white text-xs font-medium flex-shrink-0 overflow-hidden"
              style={{
                height: isMobile ? 40 : 50,
                backgroundColor: '#1f2937',
              }}
            >
              <span className="truncate px-4">🎉 {t('nav.banner')}</span>
            </div>
          )}
        </>
      )}

      <nav className="bg-orange-500 border-b border-orange-600 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 h-14 lg:h-16 max-h-14 lg:max-h-16 min-h-0">
            {/* Logo - navbarın en soluna dayalı */}
            <Link href="/" className="flex-shrink-0 flex items-center hover:opacity-90 transition-opacity -ml-1 h-8">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan Logo"
                width={120}
                height={38}
                className="object-contain max-h-8 w-auto"
                priority
              />
            </Link>

            {/* Arama - ortada */}
            <div ref={searchContainerRef} className="hidden md:flex flex-1 justify-center min-w-0 min-h-0 px-4">
              <div className="w-full max-w-md relative flex-shrink-0">
              <form onSubmit={handleSearchSubmit} className="relative h-9 block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center flex-shrink-0 pointer-events-none text-orange-400">
                  <MagnifyingGlassIcon className="w-4 h-4 shrink-0" aria-hidden />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSearchDropdown(true)}
                  placeholder={t('nav.searchPlaceholder')}
                  className="w-full h-9 pl-9 pr-3 bg-white/95 rounded-md text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-white/50 border-0"
                  aria-label={t('nav.searchPlaceholder')}
                />
              </form>
              {showSearchDropdown && (
                <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-2 z-[100] max-h-64 overflow-y-auto">
                  {recentSearches.length > 0 && (
                    <div className="px-3 py-1">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{locale === 'en' ? 'Recent' : 'Son aramalar'}</p>
                      {recentSearches.slice(0, 5).map((s) => (
                        <Link
                          key={s}
                          href={`/listings?search=${encodeURIComponent(s)}`}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                          onClick={() => setShowSearchDropdown(false)}
                        >
                          {s}
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link
                    href="/listings"
                    className={`block px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 ${recentSearches.length > 0 ? 'border-t border-gray-100 mt-1' : ''}`}
                    onClick={() => setShowSearchDropdown(false)}
                  >
                    {locale === 'en' ? 'Browse all listings' : 'Tüm ilanları gör'}
                  </Link>
                </div>
              )}
              </div>
            </div>

            {/* Right - İlan Ver + Menü + Hesap dropdown */}
            <div ref={accountDropdownRef} className="flex items-center gap-2 flex-shrink-0">
              {/* İlan Ver - her zaman görünür */}
              <Link
                href="/listings/new"
                className="flex items-center justify-center gap-1.5 h-9 px-4 bg-white text-orange-500 rounded-md text-sm font-medium hover:bg-orange-50 transition-colors"
                onClick={(e) => { if (!showAuthUI) { e.preventDefault(); setShowAuthModal(true); } }}
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('nav.newListing')}</span>
              </Link>

              {/* Hesap dropdown */}
              <div
                className="relative"
                onMouseEnter={() => {
                  if (accountDropdownLeaveTimer.current) {
                    clearTimeout(accountDropdownLeaveTimer.current);
                    accountDropdownLeaveTimer.current = null;
                  }
                  setShowAccountDropdown(true);
                }}
                onMouseLeave={() => {
                  accountDropdownLeaveTimer.current = setTimeout(() => setShowAccountDropdown(false), 150);
                }}
              >
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className="flex items-center justify-center gap-1.5 h-9 px-3 text-white hover:text-orange-100 hover:bg-white/10 rounded-md text-sm font-medium transition-colors"
                >
                  <UserCircleIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">{showAuthUI ? (user?.displayName || t('nav.account')) : t('common.login')}</span>
                  <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showAccountDropdown && (
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-[100] overflow-y-auto max-h-[calc(100vh-8rem)]">
                    {showAuthUI ? (
                      <>
                        {/* Profil - en üstte, profesyonel */}
                        <Link href="/profile" onClick={() => setShowAccountDropdown(false)} className="block px-4 py-3 hover:bg-orange-50/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
                              {(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
                              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                              {membershipTier !== 'free' && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 rounded">
                                  {membershipTier}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                        <div className="border-t border-gray-100 my-1" />
                        <Link href="/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <MagnifyingGlassIcon className="w-5 h-5" />
                          {locale === 'en' ? 'Search listings' : 'İlanlarda ara'}
                        </Link>
                        {NAV_LINKS.filter((l) => !['/listings', '/brands', '/collections'].includes(l.href)).map((link) => {
                          const isGuestTrades = link.href === '/trades' && !showAuthUI;
                          const showTradesBadge = link.href === '/trades' && pendingTradesCount > 0;
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={(e) => {
                                if (isGuestTrades) {
                                  e.preventDefault();
                                  setShowTradesAuthModal(true);
                                }
                                setShowAccountDropdown(false);
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                            >
                              {link.label}
                              {showTradesBadge && (
                                <span className="ml-auto px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                                  {pendingTradesCount > 9 ? '9+' : pendingTradesCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                        <div className="border-t border-gray-100 my-1" />
                        <Link href="/messages" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <ChatBubbleLeftRightIcon className="w-5 h-5" />
                          {t('nav.messages')}
                          {unreadMessageCount > 0 && <span className="ml-auto px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>}
                        </Link>
                        <Link href="/favorites" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <HeartIcon className="w-5 h-5" />
                          {t('nav.favorites')}
                          {wishlistCount > 0 && <span className="ml-auto text-xs text-gray-500">{wishlistCount}</span>}
                        </Link>
                        <Link href="/notifications" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <BellIcon className="w-5 h-5" />
                          {t('nav.notifications')}
                        </Link>
                        <div className="border-t border-gray-100 my-1" />
                        <Link href="/profile" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <UserCircleIcon className="w-5 h-5" />
                          {t('profile.myProfile')}
                        </Link>
                        <Link href="/profile/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <ShoppingBagIcon className="w-5 h-5" />
                          {t('nav.myListings')}
                        </Link>
                        <Link href="/orders" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <TagIcon className="w-5 h-5" />
                          {t('order.myOrders')}
                        </Link>
                        <Link href="/offers" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <CurrencyDollarIcon className="w-5 h-5" />
                          {t('offer.myOffers')}
                          {pendingOffersCount > 0 && <span className="ml-auto text-xs text-red-600">{pendingOffersCount}</span>}
                        </Link>
                        <div className="border-t border-gray-100 my-1" />
                        <div className="px-4 py-2">
                          <LanguageSwitcher variant="minimal" />
                        </div>
                        <button onClick={() => { logout(); router.push('/'); setShowAccountDropdown(false); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
                          <ArrowRightOnRectangleIcon className="w-5 h-5" />
                          {t('common.logout')}
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="px-4 py-3 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <UserCircleIcon className="w-6 h-6 text-orange-500" />
                            <span className="text-sm font-semibold text-orange-500">{t('common.login')}</span>
                          </div>
                        </div>
                        <Link href="/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600">
                          <MagnifyingGlassIcon className="w-5 h-5" />
                          {locale === 'en' ? 'Search listings' : 'İlanlarda ara'}
                        </Link>
                        {NAV_LINKS.filter((l) => !['/listings', '/brands', '/collections'].includes(l.href)).map((link) => {
                          const isGuestTrades = link.href === '/trades' && !showAuthUI;
                          return (
                            <Link
                              key={link.href}
                              href={link.href}
                              onClick={(e) => {
                                if (isGuestTrades) {
                                  e.preventDefault();
                                  setShowTradesAuthModal(true);
                                }
                                setShowAccountDropdown(false);
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600"
                            >
                              {link.label}
                            </Link>
                          );
                        })}
                        <div className="border-t border-gray-100 my-1" />
                        <div className="p-4 space-y-2">
                          <Link
                            href="/login"
                            onClick={() => setShowAccountDropdown(false)}
                            className="flex items-center justify-center w-full py-2.5 px-4 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                          >
                            {t('common.login')}
                          </Link>
                          <Link
                            href="/register"
                            onClick={() => setShowAccountDropdown(false)}
                            className="flex items-center justify-center w-full py-2.5 px-4 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                          >
                            {t('common.register')}
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Sepet - en sağda, Giriş Yap'ın sağında ikon + yazı */}
              <Link
                href="/cart"
                className="flex items-center justify-center gap-1.5 h-9 px-3 text-white hover:text-orange-100 hover:bg-white/10 rounded-md text-sm font-medium transition-colors relative"
                title={t('nav.cart')}
              >
                <ShoppingCartIcon className="w-5 h-5" />
                <span className="hidden sm:inline">{t('nav.cart')}</span>
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-white text-orange-500 text-xs rounded-full flex items-center justify-center font-semibold">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>

            </div>
          </div>
        </div>

        {/* Auth Required Modal for İlan Ver */}
        <AuthRequiredModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          title={t('nav.loginToCreateListing')}
          message={t('nav.loginToCreateListingMsg')}
          icon={<PlusIcon className="w-10 h-10 text-primary-500" />}
          redirectPath="/listings/new"
        />

        {/* Auth Required Modal for Takaslar */}
        <AuthRequiredModal
          isOpen={showTradesAuthModal}
          onClose={() => setShowTradesAuthModal(false)}
          title={t('nav.loginForTrades')}
          message={t('trade.tradeRequiresLogin')}
          icon={<ArrowsRightLeftIcon className="w-10 h-10 text-primary-500" />}
          redirectPath="/trades"
        />
      </nav>

      {/* CategoryMegaMenu kaldırıldı */}
    </>
  );
}

