'use client';

import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { IconButton } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { useLocale, useTranslations } from "next-intl";
import type { MessageThread } from '../_lib/messages';

export default function ChatHeader({
  thread,
  typing,
  onBack,
}: {
  thread: MessageThread;
  typing: boolean;
  onBack: () => void;
}) {
  const locale = useLocale();

  return (
    <div className="flex-shrink-0 px-4 py-3 bg-surface-elevated border-b border-border flex items-center gap-3 shadow-sm">
      <IconButton
        variant="ghost"
        size="sm"
        className="sm:hidden -ml-1"
        aria-label={locale === 'en' ? 'Back' : 'Geri'}
        onClick={onBack}>
        <ChevronLeftIcon className="w-5 h-5" />
      </IconButton>
      <UserAvatar displayName={thread.otherUser?.displayName} avatarUrl={thread.otherUser?.avatarUrl} size="sm" className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-heading text-sm truncate">
          {thread.otherUser?.displayName || 'Kullanıcı'}
        </p>
        {typing ? (
          <p className="text-xs text-primary-600 truncate">
            {locale === 'en' ? 'typing…' : 'yazıyor…'}
          </p>
        ) : thread.product ? (
          <p className="text-xs text-primary-600 truncate">📦 {thread.product.title}</p>
        ) : null}
      </div>
    </div>
  );
}
