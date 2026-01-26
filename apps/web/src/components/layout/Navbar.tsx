'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
  ClockIcon,
  XCircleIcon,
  FireIcon,
  CurrencyDollarIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi, api } from '@/lib/api';
import NotificationBell from '@/components/notifications/NotificationBell';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/LanguageContext';

const RECENT_SEARCHES_KEY = 'tarodan_recent_searches';
const MAX_RECENT_SEARCHES = 5;

// Popular search suggestions
const POPULAR_SEARCHES = {
  tr: ['Hot Wheels', 'Matchbox', 'Minichamps', '1:18 ölçek', 'Ferrari', 'Porsche'],
  en: ['Hot Wheels', 'Matchbox', 'Minichamps', '1:18 scale', 'Ferrari', 'Porsche'],
};

export default function Navbar() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { itemCount: cartCount } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [pendingTradesCount, setPendingTradesCount] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);

  const NAV_LINKS = [
    { href: '/listings', label: t('nav.listings') },
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

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {
        setRecentSearches([]);
      }
    }
  }, []);

  // Handle click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveRecentSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    
    const updated = [trimmed, ...recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const removeRecentSearch = (searchToRemove: string) => {
    const updated = recentSearches.filter(s => s !== searchToRemove);
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const handleSearchSubmit = (query: string) => {
    const trimmed = query.trim();
    if (trimmed) {
      saveRecentSearch(trimmed);
      setShowSearchDropdown(false);
      setSearchQuery('');
      router.push(`/listings?search=${encodeURIComponent(trimmed)}`);
    }
  };

  const fetchUnreadMessageCount = async () => {
    try {
      const response = await messagesApi.getThreads();
      const threads = response.data.data || response.data.threads || [];
      const totalUnread = threads.reduce((sum: number, thread: any) => {
        return sum + (thread.unreadCount || 0);
      }, 0);
      setUnreadMessageCount(totalUnread);
    } catch (error) {
      console.error('Failed to fetch unread message count:', error);
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
      console.error('Failed to fetch pending counts:', error);
    }
  };

  // Premium ve Business üyeler için reklam banner'ını gizle
  const shouldShowAd = !isAuthenticated || (user?.membershipTier !== 'premium' && user?.membershipTier !== 'business');

  return (
    <>
      {/* Reklam Banner */}
      {shouldShowAd && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white text-center py-2 text-xs font-medium">
          🎉 {t('nav.banner')}
        </div>
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
              priority
            />
          </Link>

          {/* Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-8" ref={searchContainerRef}>
            <div className="relative w-full">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearchSubmit(searchQuery);
                }}
                className="relative w-full"
              >
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('nav.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSearchDropdown(true)}
                  className="w-full pl-12 pr-4 py-3 bg-white border-2 border-transparent rounded-xl focus:outline-none focus:border-orange-300 focus:ring-0 transition-all placeholder:text-gray-400 text-gray-900 shadow-sm"
                />
              </form>

              {/* Search Dropdown */}
              <AnimatePresence>
                {showSearchDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
                  >
                    {/* Recent Searches */}
                    {recentSearches.length > 0 && (
                      <div className="p-3 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5" />
                            {locale === 'en' ? 'Recent Searches' : 'Son Aramalar'}
                          </span>
                          <button
                            onClick={clearAllRecentSearches}
                            className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                          >
                            {locale === 'en' ? 'Clear' : 'Temizle'}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {recentSearches.map((search, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between group"
                            >
                              <button
                                onClick={() => handleSearchSubmit(search)}
                                className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left"
                              >
                                <ClockIcon className="w-4 h-4 text-gray-400" />
                                {search}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRecentSearch(search);
                                }}
                                className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <XCircleIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Popular Searches */}
                    <div className="p-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                        <FireIcon className="w-3.5 h-3.5" />
                        {locale === 'en' ? 'Popular' : 'Popüler'}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {POPULAR_SEARCHES[locale as 'tr' | 'en'].map((search, index) => (
                          <button
                            key={index}
                            onClick={() => handleSearchSubmit(search)}
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-600 rounded-lg transition-colors"
                          >
                            {search}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Nav Links - Desktop */}
          <div className="hidden lg:flex items-center gap-6 mr-12">
            {NAV_LINKS.map((link) => {
              // Takaslar link requires auth for guests
              if (link.href === '/trades' && !isAuthenticated) {
                return (
                  <button
                    key={link.href}
                    onClick={() => setShowTradesAuthModal(true)}
                    className="text-white hover:text-orange-100 font-medium transition-colors text-sm"
                  >
                    {link.label}
                  </button>
                );
              }
              // Show badge for trades if there are pending trades
              if (link.href === '/trades' && pendingTradesCount > 0) {
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="relative text-white hover:text-orange-100 font-medium transition-colors text-sm flex items-center gap-1"
                  >
                    {link.label}
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">
                      {pendingTradesCount > 9 ? '9+' : pendingTradesCount}
                    </span>
                  </Link>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-white hover:text-orange-100 font-medium transition-colors text-sm"
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4 ml-8">
            {isAuthenticated ? (
              <>
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
                  className="p-2 text-white hover:text-orange-100 transition-colors hidden sm:block"
                >
                  <HeartIcon className="w-6 h-6" />
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
                        href="/wishlist"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      >
                        <HeartIcon className="w-5 h-5" />
                        {t('nav.favorites')}
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
              </>
            ) : (
              <>
              <div className="flex items-center gap-4">
                {/* İlan Ver butonu - Guest Desktop */}
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="hidden md:flex items-center gap-1.5 bg-white text-orange-500 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>{t('nav.newListing')}</span>
                </button>
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
              </>
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
              {/* Mobile Search */}
              <div className="space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (searchQuery.trim()) {
                      handleSearchSubmit(searchQuery);
                      setIsOpen(false);
                    }
                  }}
                  className="relative w-full"
                >
                  <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t('nav.searchPlaceholderMobile')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-white/50 placeholder:text-gray-400 text-gray-900"
                  />
                </form>

                {/* Mobile Recent Searches */}
                {recentSearches.length > 0 && (
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white/70 uppercase tracking-wide flex items-center gap-1.5">
                        <ClockIcon className="w-3.5 h-3.5" />
                        {locale === 'en' ? 'Recent' : 'Son Aramalar'}
                      </span>
                      <button
                        onClick={clearAllRecentSearches}
                        className="text-xs text-white/70 hover:text-white font-medium"
                      >
                        {locale === 'en' ? 'Clear' : 'Temizle'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.slice(0, 3).map((search, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            handleSearchSubmit(search);
                            setIsOpen(false);
                          }}
                          className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
                        >
                          {search}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile Nav Links */}
              {NAV_LINKS.map((link) => {
                // Takaslar link requires auth for guests
                if (link.href === '/trades' && !isAuthenticated) {
                  return (
                    <button
                      key={link.href}
                      onClick={() => {
                        setIsOpen(false);
                        setShowTradesAuthModal(true);
                      }}
                      className="block py-2 text-white hover:text-orange-100 font-medium text-left w-full"
                    >
                      {link.label}
                    </button>
                  );
                }
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block py-2 text-white hover:text-orange-100 font-medium"
                    onClick={() => setIsOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
              
              {/* Mobile Auth Links */}
              <div className="border-t border-orange-600 pt-4 mt-4">
                {isAuthenticated ? (
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
    </>
  );
}

