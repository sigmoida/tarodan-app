'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MagnifyingGlassIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  HeartIcon,
  ShoppingBagIcon,
  TagIcon,
  ArrowRightOnRectangleIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/LanguageContext';
import { useNavbar } from './context/NavbarContext';
import { useAccountDropdown } from './hooks/useAccountDropdown';

/**
 * The account dropdown: trigger button + panel (authed profile menu or the
 * guest login/register panel). Includes the in-panel LanguageSwitcher and the
 * mobile "search listings" entry.
 */
export default function AccountMenu() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const {
    showAuthUI,
    user,
    logout,
    unreadMessageCount,
    unreadNotificationsCount,
    pendingOffersCount,
    pendingTradesCount,
    wishlistCount,
    setShowTradesAuthModal,
  } = useNavbar();
  const {
    accountDropdownRef,
    showAccountDropdown,
    setShowAccountDropdown,
    handleMouseEnter,
    handleMouseLeave,
  } = useAccountDropdown();

  const NAV_LINKS = [
    { href: '/listings', label: t('nav.listings') },
    { href: '/takas', label: t('nav.tradeShowcase') || 'Takas Vitrini' },
    { href: '/ureticiler', label: t('nav.brands') || 'Üreticiler' },
    { href: '/trades', label: t('nav.trades') },
    { href: '/collections', label: t('nav.collections') },
    { href: '/pricing', label: t('nav.pricing') },
  ];

  const membershipTier = user?.membershipTier || 'free';

  return (
    <div
      ref={accountDropdownRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button
        variant="nav"
        size="sm"
        onClick={() => setShowAccountDropdown(!showAccountDropdown)}
        aria-expanded={showAccountDropdown}
        className="gap-1.5 h-9 rounded-md"
      >
        <UserCircleIcon className="w-5 h-5" />
        <span className="hidden sm:inline">{showAuthUI ? (user?.displayName || t('nav.account')) : t('common.login')}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
      </Button>

      {showAccountDropdown && (
        <div className="absolute right-0 mt-1 w-56 bg-surface-elevated rounded-lg shadow-xl border border-border-subtle py-1 z-[100] overflow-y-auto max-h-[calc(100vh-8rem)]">
          {showAuthUI ? (
            <>
              {/* Profil - en üstte, profesyonel */}
              <Link href="/profile" onClick={() => setShowAccountDropdown(false)} className="block px-4 py-3 hover:bg-primary-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    displayName={user?.displayName || user?.email}
                    avatarUrl={user?.avatarUrl}
                    size="sm"
                    className="!w-10 !h-10 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-heading truncate">{user?.displayName}</p>
                    <p className="text-xs text-muted truncate">{user?.email}</p>
                    {membershipTier !== 'free' && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-warning-100 text-warning-700 rounded">
                        {membershipTier}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <div className="border-t border-border-subtle my-1" />
              <Link href="/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <MagnifyingGlassIcon className="w-5 h-5" />
                {locale === 'en' ? 'Search listings' : 'İlanlarda ara'}
              </Link>
              {NAV_LINKS.filter((l) => !['/listings', '/ureticiler', '/collections'].includes(l.href)).map((link) => {
                const isGuestTrades = link.href === '/trades' && !showAuthUI;
                const showTradesBadge = false; // Takaslar yanında badge gösterme
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
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600"
                  >
                    {link.label}
                    {showTradesBadge && (
                      <span className="ml-auto px-1.5 py-0.5 bg-danger-500 text-inverted text-[10px] font-bold rounded-full">
                        {pendingTradesCount > 9 ? '9+' : pendingTradesCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="border-t border-border-subtle my-1" />
              <Link href="/messages" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                {t('nav.messages')}
                {unreadMessageCount > 0 && <span className="ml-auto px-1.5 py-0.5 bg-danger-500 text-inverted text-xs rounded-full">{unreadMessageCount > 9 ? '9+' : unreadMessageCount}</span>}
              </Link>
              <Link href="/favorites" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <HeartIcon className="w-5 h-5" />
                {t('nav.favorites')}
                {wishlistCount > 0 && <span className="ml-auto text-xs text-muted">{wishlistCount}</span>}
              </Link>
              <Link href="/notifications" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <BellIcon className="w-5 h-5" />
                {t('nav.notifications')}
                {unreadNotificationsCount > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 bg-danger-500 text-inverted text-xs rounded-full">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </Link>

              <div className="border-t border-border-subtle my-1" />
              <Link href="/profile" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <UserCircleIcon className="w-5 h-5" />
                {t('profile.myProfile')}
              </Link>
              <Link href="/profile/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <ShoppingBagIcon className="w-5 h-5" />
                {t('nav.myListings')}
              </Link>
              <Link href="/orders" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <TagIcon className="w-5 h-5" />
                {t('order.myOrders')}
              </Link>
              <Link href="/offers" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <CurrencyDollarIcon className="w-5 h-5" />
                {t('offer.myOffers')}
                {pendingOffersCount > 0 && <span className="ml-auto text-xs text-danger-600">{pendingOffersCount}</span>}
              </Link>
              <div className="border-t border-border-subtle my-1" />
              <div className="px-4 py-2">
                <LanguageSwitcher variant="minimal" />
              </div>
              <Button variant="secondary" onClick={() => { logout(); router.push('/'); setShowAccountDropdown(false); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50">
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
                {t('common.logout')}
              </Button>
            </>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <UserCircleIcon className="w-6 h-6 text-primary-500" />
                  <span className="text-sm font-semibold text-primary-500">{t('common.login')}</span>
                </div>
              </div>
              <Link href="/listings" onClick={() => setShowAccountDropdown(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600">
                <MagnifyingGlassIcon className="w-5 h-5" />
                {locale === 'en' ? 'Search listings' : 'İlanlarda ara'}
              </Link>
              {NAV_LINKS.filter((l) => !['/listings', '/ureticiler', '/collections'].includes(l.href)).map((link) => {
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
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600"
                  >
                    {link.label}
                  </Link>
                );
              })}
              <div className="border-t border-border-subtle my-1" />
              <div className="p-4 space-y-2">
                <Link
                  href="/login"
                  onClick={() => setShowAccountDropdown(false)}
                  className="flex items-center justify-center w-full py-2.5 px-4 bg-primary-500 text-inverted text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
                >
                  {t('common.login')}
                </Link>
                <Link
                  href="/register"
                  onClick={() => setShowAccountDropdown(false)}
                  className="flex items-center justify-center w-full py-2.5 px-4 border border-border-subtle text-body text-sm font-medium rounded-lg hover:bg-surface transition-colors"
                >
                  {t('common.register')}
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
