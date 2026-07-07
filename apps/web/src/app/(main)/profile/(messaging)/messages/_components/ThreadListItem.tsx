'use client';

import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n';
import { getThreadPreview, type MessageThread } from '../_lib/messages';

export default function ThreadListItem({
  thread,
  isSelected,
  onSelect,
}: {
  thread: MessageThread;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { locale } = useTranslation();

  return (
    // A full-width, multi-line list row — the @tarodan/ui Button (fixed height,
    // centered) doesn't fit, so the native button is the right element here.
    // eslint-disable-next-line no-restricted-syntax
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full text-left px-4 py-3 transition-colors border-l-4 border-b border-border-subtle last:border-b-0 ${
        isSelected
          ? 'border-l-primary-500 bg-primary-50/60'
          : 'border-l-transparent hover:bg-surface'
      }`}>
      <div className="flex items-center gap-3 w-full min-w-0">
        <div className="relative flex-shrink-0">
          <UserAvatar displayName={thread.otherUser?.displayName} avatarUrl={thread.otherUser?.avatarUrl} size="sm" className="!w-11 !h-11" />
          {thread.unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-500 rounded-full border-2 border-surface-elevated" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-heading truncate text-sm">
              {thread.otherUser?.displayName || 'Kullanıcı'}
            </span>
            {thread.unreadCount > 0 && (
              <span className="flex-shrink-0 text-xs font-medium text-primary-600 bg-primary-100 px-1.5 py-0.5 rounded">
                {thread.unreadCount}
              </span>
            )}
          </div>
          {thread.lastMessage && (
            <p className="text-sm text-muted truncate mt-0.5">
              {thread.lastMessage.isFromMe ? (locale === 'en' ? 'You: ' : 'Sen: ') : ''}
              {getThreadPreview(thread.lastMessage.content, locale)}
            </p>
          )}
          {thread.product && (
            <p className="text-xs text-primary-600 truncate mt-0.5">📦 {thread.product.title}</p>
          )}
        </div>
      </div>
    </button>
  );
}
