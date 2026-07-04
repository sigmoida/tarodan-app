'use client';

import Link from 'next/link';
import { PlusIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useTranslation } from '@/i18n/LanguageContext';
import { useNavbar } from './context/NavbarContext';

/**
 * The right-side action cluster shown before the account dropdown: the always
 * visible "İlan Ver" button (opens the auth modal for guests), the messages
 * quick-link with its unread badge, and the notification bell.
 */
export default function NavbarActions() {
  const { t } = useTranslation();
  const { showAuthUI, setShowAuthModal, unreadMessageCount } = useNavbar();

  return (
    <>
      {/* İlan Ver - her zaman görünür */}
      <Link
        href="/listings/new"
        className="flex items-center justify-center gap-1.5 h-9 px-4 bg-surface-elevated text-primary-500 rounded-md text-sm font-medium hover:bg-primary-50 transition-colors"
        onClick={(e) => { if (!showAuthUI) { e.preventDefault(); setShowAuthModal(true); } }}
      >
        <PlusIcon className="w-4 h-4" />
        <span className="hidden sm:inline">{t('nav.newListing')}</span>
      </Link>

      {/* Mesajlar - bildirim zilinin solunda hızlı erişim */}
      {showAuthUI && (
        <Link
          href="/messages"
          aria-label={t('nav.messages')}
          title={t('nav.messages')}
          className="relative flex items-center justify-center w-9 h-9 rounded-md text-inverted/90 hover:text-inverted hover:bg-surface-elevated/10 transition-colors"
        >
          <ChatBubbleLeftRightIcon className="w-6 h-6" />
          {unreadMessageCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-danger-500 text-inverted text-[10px] font-semibold rounded-full">
              {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
            </span>
          )}
        </Link>
      )}

      {/* Notification Bell */}
      {showAuthUI && <NotificationBell />}
    </>
  );
}
