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
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi } from '@/lib/api';
import NotificationBell from '@/components/notifications/NotificationBell';

const NAV_LINKS = [
  { href: '/listings', label: 'İlanlar' },
  { href: '/trades', label: 'Takaslar' },
  { href: '/collections', label: 'Koleksiyonlar' },
  { href: '/pricing', label: 'Üyelik' },
];

export default function Navbar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated, user, logout, checkAuth } = useAuthStore();
  const { itemCount: cartCount } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

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
      <div className="bg-gray-100 text-center py-2 text-sm text-gray-600">
        REKLAM ALANI
      </div>
      
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Tarodan Logo"
              width={40}
              height={40}
              className="rounded-xl"
            />
            <span className="font-display font-bold text-xl hidden sm:block">
              TARODAN
            </span>
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
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Kategori, ürün, marka, koleksiyon ara"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
              />
            </form>
          </div>

          {/* Nav Links - Desktop */}
          <div className="hidden lg:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-600 hover:text-primary-500 font-medium transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link
                  href="/messages"
                  className="p-2 text-gray-600 hover:text-primary-500 transition-colors relative"
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
                  className="p-2 text-gray-600 hover:text-primary-500 transition-colors hidden sm:block"
                >
                  <HeartIcon className="w-6 h-6" />
                </Link>
                <NotificationBell />
                <Link
                  href="/cart"
                  className="p-2 text-gray-600 hover:text-primary-500 transition-colors relative"
                >
                  <ShoppingCartIcon className="w-6 h-6" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                </Link>
                <div className="relative group">
                  <Link
                    href="/profile"
                    className="p-2 text-gray-600 hover:text-primary-500 transition-colors flex items-center gap-2"
                  >
                    <UserCircleIcon className="w-7 h-7" />
                    {user && (
                      <span className="hidden lg:block text-sm font-medium text-gray-700">
                        {user.displayName}
                      </span>
                    )}
                  </Link>
                  {/* Dropdown menu */}
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <Link
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsOpen(false)}
                    >
                      Profilim
                    </Link>
                    <Link
                      href="/orders"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setIsOpen(false)}
                    >
                      Siparişlerim
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        router.push('/');
                        setIsOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
                    >
                      Çıkış Yap
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center">
                <Link
                  href="/login"
                  className="text-gray-600 hover:text-primary-500 font-medium transition-colors hidden sm:block mr-6"
                >
                  Giriş yap
                </Link>
                <Link
                  href="/register"
                  className="bg-primary-500 text-white px-4 py-2 rounded-xl font-medium hover:bg-primary-600 transition-colors mr-6"
                >
                  Üye Ol
                </Link>
                <Link
                  href="/cart"
                  className="text-gray-600 hover:text-primary-500 font-medium transition-colors hidden sm:flex items-center gap-1"
                >
                  <ShoppingCartIcon className="w-5 h-5" />
                  Sepetim
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden p-2 text-gray-600"
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
            className="lg:hidden border-t border-gray-100"
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
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Model, marka ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500"
                />
              </form>

              {/* Mobile Nav Links */}
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block py-2 text-gray-600 hover:text-primary-500 font-medium"
                  onClick={() => setIsOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              
              {/* Mobile Auth Links */}
              <div className="border-t border-gray-100 pt-4 mt-4">
                {isAuthenticated ? (
                  <div className="space-y-2">
                    <Link
                      href="/profile"
                      className="block py-2 text-gray-600 hover:text-primary-500 font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Profilim
                    </Link>
                    <Link
                      href="/profile/listings"
                      className="block py-2 text-gray-600 hover:text-primary-500 font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      İlanlarım
                    </Link>
                    <Link
                      href="/orders"
                      className="block py-2 text-gray-600 hover:text-primary-500 font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Siparişlerim
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        setIsOpen(false);
                      }}
                      className="block w-full text-left py-2 text-red-500 hover:text-red-600 font-medium"
                    >
                      Çıkış Yap
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/login"
                      className="block py-2 text-center text-gray-600 hover:text-primary-500 font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      Giriş Yap
                    </Link>
                    <Link
                      href="/register"
                      className="block py-2 text-center bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600"
                      onClick={() => setIsOpen(false)}
                    >
                      Üye Ol
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </nav>
    </>
  );
}


