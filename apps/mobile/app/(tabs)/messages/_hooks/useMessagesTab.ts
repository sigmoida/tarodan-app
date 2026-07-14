import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMessagesStore, type MessageThread } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';
import { useThreadsQuery, useUnreadCountQuery } from '@/hooks/messaging';

/**
 * Messages-tab controller — threads/unread artık React Query (#77); focus'ta
 * refetch, search filter, güvenli participant resolver ve limit türevleri burada.
 * getOtherParticipant + dailyMessageCount hâlâ client store'dan (§8).
 */
export function useMessagesTab() {
  const { isAuthenticated, user, limits } = useAuthStore();
  const getOtherParticipant = useMessagesStore((s) => s.getOtherParticipant);
  const dailyMessageCount = useMessagesStore((s) => s.dailyMessageCount);
  const { data: threads = [], isLoading, isFetched: hasLoadedThreads, refetch } = useThreadsQuery();
  const { data: unreadCount = 0 } = useUnreadCountQuery();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated, refetch]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Güvenli participant helper — store'dan gelen null/undefined durumlarını yakala.
  const safeGetOther = (thread: MessageThread) => {
    try {
      const result = getOtherParticipant(thread);
      if (!result) {
        return { id: '', displayName: 'Kullanıcı', avatarUrl: null };
      }
      return {
        id: result.id || '',
        displayName: result.displayName || 'Kullanıcı',
        avatarUrl: result.avatarUrl || null,
      };
    } catch {
      return { id: '', displayName: 'Kullanıcı', avatarUrl: null };
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery) return true;
    const other = safeGetOther(thread);
    return (
      other.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (thread.product?.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const messageLimit = limits?.maxMessagesPerDay || 50;
  const isUnlimited = messageLimit === -1;

  return {
    isAuthenticated,
    user,
    threads,
    isLoading,
    hasLoadedThreads,
    dailyMessageCount,
    refreshing,
    onRefresh,
    searchQuery,
    setSearchQuery,
    safeGetOther,
    filteredThreads,
    unreadCount,
    messageLimit,
    isUnlimited,
  };
}

export type MessagesTabController = ReturnType<typeof useMessagesTab>;
