'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bars3Icon,
  XMarkIcon,
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
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi, api, wishlistApi } from '@/lib/api';
import NotificationBell from '@/components/notifications/NotificationBell';
import dynamic from 'next/dynamic';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(() => import('@/components/AuthRequiredModal'), 'AuthRequiredModal'),
  { ssr: false }
);
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/LanguageContext';
import CategoryMegaMenu from './CategoryMegaMenu';

export default function Navbar() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { itemCount: cartCount } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [pendingTradesCount, setPendingTradesCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);
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
              className="w-full relative flex items-center justify-center border-b border-gray-700 text-white text-xs font-medium"
              style={{
                height: isMobile ? 40 : 50,
                backgroundColor: '#1f2937',
              }}
            >
              🎉 {t('nav.banner')}
            </div>
          )}
        </>
      )}

      <nav className="bg-orange-500 border-b border-orange-600 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
              <Image
                src="/tarodan-logo.jpg"
                alt="Tarodan Logo"
                width={160}
                height={52}
                className="object-contain"
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
            </Link>

            {/* Spacer - search moved to GlobalSearchBar below header */}
            <div className="hidden md:block flex-1 min-w-0 mx-4 lg:mx-8" />

            {/* Nav Links - Desktop */}
            <div className="hidden lg:flex items-center gap-6 mr-12">
              {NAV_LINKS.map((link) => {
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
                    }}
                    className={
                      showTradesBadge
                        ? 'relative text-white hover:text-orange-100 font-medium transition-colors text-sm flex items-center gap-1'
                        : 'text-white hover:text-orange-100 font-medium transition-colors text-sm'
                    }
                  >
                    {link.label}
                    {showTradesBadge && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                        {pendingTradesCount > 9 ? '9+' : pendingTradesCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right Actions - same wrapper (div) in both branches to avoid hydration mismatch */}
            <div className="flex items-center gap-4 ml-8">
              {showAuthUI ? (
                <div className="flex items-center gap-4">
                  {/* Yeni İlan Ekle Butonu - Desktop */}
                  <Link
                    href="/listings/new"
                    className="hidden md:flex items-center gap-1.5 bg-white text-orange-500 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>{t('nav.newListing')}</span>
                  </Link>
                  <Link
                    href="/messages"
                    className="p-2 text-white hover:text-orange-100 transition-colors relative"
                  >
                    <ChatBubbleLeftRightIcon className="w-6 h-6" />
                    {unreadMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/favorites"
                    className="p-2 text-white hover:text-orange-100 transition-colors relative hidden sm:block"
                  >
                    <HeartIcon className="w-6 h-6" />
                    {wishlistCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-semibold">
                        {wishlistCount > 9 ? '9+' : wishlistCount}
                      </span>
                    )}
                  </Link>
                  <NotificationBell />
                  <Link
                    href="/cart"
                    className="p-2 text-white hover:text-orange-100 transition-colors relative"
                  >
                    <ShoppingCartIcon className="w-6 h-6" />
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-orange-500 text-xs rounded-full flex items-center justify-center font-semibold">
                        {cartCount > 9 ? '9+' : cartCount}
                      </span>
                    )}
                  </Link>
                  <div className="relative group">
                    <Link
                      href="/profile"
                      className="p-2 text-white hover:text-orange-100 transition-colors flex items-center gap-2"
                    >
                      <UserCircleIcon className="w-7 h-7" />
                      {user && (
                        <span className="hidden lg:block text-sm font-medium text-white">
                          {user.displayName}
                        </span>
                      )}
                    </Link>
                    {/* Dropdown menu */}
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden">
                      {/* User info header */}
                      <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-orange-100 border-b border-orange-100 relative">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                          </div>
                          {/* Language Switcher - Top Right */}
                          <div className="flex-shrink-0">
                            <LanguageSwitcher variant="minimal" />
                          </div>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="py-2">
                        <Link
                          href="/profile"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <UserCircleIcon className="w-5 h-5" />
                          {t('profile.myProfile')}
                        </Link>
                        <Link
                          href="/profile/listings"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <ShoppingBagIcon className="w-5 h-5" />
                          {t('nav.myListings')}
                        </Link>
                        <Link
                          href="/orders"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <TagIcon className="w-5 h-5" />
                          {t('order.myOrders')}
                        </Link>
                        <Link
                          href="/offers"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <div className="relative">
                            <CurrencyDollarIcon className="w-5 h-5" />
                            {pendingOffersCount > 0 && (
                              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {pendingOffersCount > 9 ? '9+' : pendingOffersCount}
                              </span>
                            )}
                          </div>
                          {t('offer.myOffers')}
                          {pendingOffersCount > 0 && (
                            <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                              {pendingOffersCount}
                            </span>
                          )}
                        </Link>
                        <Link
                          href="/favorites"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <HeartIcon className="w-5 h-5" />
                          {t('nav.favorites')}
                        </Link>
                        <Link
                          href="/profile/membership"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <SparklesIcon className="w-5 h-5" />
                          {t('membership.title')}
                        </Link>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-gray-100"></div>

                      {/* Settings & Support */}
                      <div className="py-2">
                        <Link
                          href="/profile/addresses"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <MapPinIcon className="w-5 h-5" />
                          {t('address.myAddresses')}
                        </Link>
                        <Link
                          href="/profile/settings"
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                          <CogIcon className="w-5 h-5" />
                          {t('nav.settings')}
                        </Link>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-gray-100"></div>

                      {/* Logout */}
                      <div className="py-2">
                        <button
                          onClick={() => {
                            logout();
                            router.push('/');
                            setIsOpen(false);
                          }}
                          className="flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <ArrowRightOnRectangleIcon className="w-5 h-5" />
                          {t('common.logout')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {/* İlan Ver - Guest Desktop (Link to avoid hydration mismatch: server/client must both render <a> first) */}
                  <Link
                    href="/listings/new"
                    className="hidden md:flex items-center gap-1.5 bg-white text-orange-500 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
                    onClick={(e) => { e.preventDefault(); setShowAuthModal(true); }}
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>{t('nav.newListing')}</span>
                  </Link>
                  <Link
                    href="/login"
                    className="text-white hover:text-orange-100 font-medium transition-colors hidden sm:block"
                  >
                    {t('common.login')}
                  </Link>
                  <Link
                    href="/register"
                    className="bg-white text-orange-500 px-4 py-2 rounded-xl font-medium hover:bg-orange-50 transition-colors"
                  >
                    {t('common.register')}
                  </Link>
                  <Link
                    href="/cart"
                    className="text-white hover:text-orange-100 font-medium transition-colors hidden sm:flex items-center gap-1"
                  >
                    <ShoppingCartIcon className="w-5 h-5" />
                    {t('nav.cart')}
                  </Link>
                </div>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="lg:hidden p-2 text-white"
              >
                {isOpen ? (
                  <XMarkIcon className="w-6 h-6" />
                ) : (
                  <Bars3Icon className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-orange-600 bg-orange-500"
            >
              <div className="px-4 py-4 space-y-4">
                {/* Arama: Sayfada hemen altında GlobalSearchBar kullanılır */}
                <Link
                  href="/listings"
                  className="flex items-center gap-2 py-2 text-white hover:text-orange-100 font-medium"
                  onClick={() => setIsOpen(false)}
                >
                  <MagnifyingGlassIcon className="w-5 h-5" />
                  {locale === 'en' ? 'Search listings' : 'İlanlarda ara'}
                </Link>

                {/* Mobile Nav Links - always use Link to avoid hydration mismatch */}
                {NAV_LINKS.map((link) => {
                  const isGuestTrades = link.href === '/trades' && !showAuthUI;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block py-2 text-white hover:text-orange-100 font-medium text-left w-full"
                      onClick={(e) => {
                        if (isGuestTrades) { e.preventDefault(); setShowTradesAuthModal(true); }
                        setIsOpen(false);
                      }}
                    >
                      {link.label}
                    </Link>
                  );
                })}

                {/* Mobile Auth Links */}
                <div className="border-t border-orange-600 pt-4 mt-4">
                  {showAuthUI ? (
                    <div className="space-y-2">
                      {/* Yeni İlan Ekle Butonu - Mobile */}
                      <Link
                        href="/listings/new"
                        className="flex items-center justify-center gap-2 bg-white text-orange-500 px-4 py-2.5 rounded-lg font-medium hover:bg-orange-50 transition-colors mb-4"
                        onClick={() => setIsOpen(false)}
                      >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('nav.newListing')}</span>
                      </Link>
                      <Link
                        href="/profile"
                        className="block py-2 text-white hover:text-orange-100 font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        {t('profile.myProfile')}
                      </Link>
                      <Link
                        href="/profile/listings"
                        className="block py-2 text-white hover:text-orange-100 font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        {t('nav.myListings')}
                      </Link>
                      <Link
                        href="/orders"
                        className="block py-2 text-white hover:text-orange-100 font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        {t('order.myOrders')}
                      </Link>
                      <Link
                        href="/offers"
                        className="flex items-center gap-2 py-2 text-white hover:text-orange-100 font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        {t('offer.myOffers')}
                        {pendingOffersCount > 0 && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                            {pendingOffersCount}
                          </span>
                        )}
                      </Link>
                      {/* Language Switcher - Mobile */}
                      <div className="py-2">
                        <LanguageSwitcher variant="buttons" />
                      </div>
                      <button
                        onClick={() => {
                          logout();
                          setIsOpen(false);
                        }}
                        className="block w-full text-left py-2 text-red-500 hover:text-red-600 font-medium"
                      >
                        {t('common.logout')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* İlan Ver butonu - Guest Mobile */}
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          setShowAuthModal(true);
                        }}
                        className="flex items-center justify-center gap-2 w-full bg-white text-orange-500 px-4 py-2.5 rounded-lg font-medium hover:bg-orange-50 transition-colors mb-4"
                      >
                        <PlusIcon className="w-4 h-4" />
                        <span>{t('nav.newListing')}</span>
                      </button>
                      {/* Language Switcher - Mobile Guest */}
                      <div className="py-2">
                        <LanguageSwitcher variant="buttons" />
                      </div>
                      <Link
                        href="/login"
                        className="block py-2.5 text-center text-white hover:text-orange-100 font-medium rounded-lg hover:bg-white/10 transition-colors"
                        onClick={() => setIsOpen(false)}
                      >
                        {t('common.login')}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

