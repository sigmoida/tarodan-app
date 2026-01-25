'use client';

import { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi } from '@/lib/api';
import NotificationBell from '@/components/notifications/NotificationBell';
import AuthRequiredModal from '@/components/AuthRequiredModal';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/LanguageContext';

export default function Navbar() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { itemCount: cartCount } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
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
      // Poll for new messages every 30 seconds
      const interval = setInterval(fetchUnreadMessageCount, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadMessageCount(0);
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
      console.error('Failed to fetch unread message count:', error);
    }
  };

  return (
    <>
      {/* Reklam Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white text-center py-2 text-xs font-medium">
        🎉 {t('nav.banner')}
      </div>
      
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
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  router.push(`/listings?search=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
              className="relative w-full"
            >
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-300" />
              <input
                type="text"
                placeholder={t('nav.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-white/90 border border-white/50 rounded-xl focus:outline-none focus:border-white focus:ring-2 focus:ring-white/30 transition-all placeholder:text-gray-500"
              />
            </form>
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
            {/* Language Switcher - Desktop */}
            <div className="hidden md:block">
              <LanguageSwitcher variant="minimal" />
            </div>
            
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
                    <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-orange-100 border-b border-orange-100">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user?.displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    router.push(`/listings?search=${encodeURIComponent(searchQuery.trim())}`);
                    setIsOpen(false);
                  }
                }}
                className="relative w-full"
              >
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-300" />
                <input
                  type="text"
                  placeholder={t('nav.searchPlaceholderMobile')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white/90 border border-white/50 rounded-xl focus:outline-none focus:border-white placeholder:text-gray-500"
                />
              </form>

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

