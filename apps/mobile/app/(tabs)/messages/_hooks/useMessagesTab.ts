import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMessagesStore, type MessageThread } from '@/stores/messagesStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Messages-tab controller — owns the threads fetch (focus + refresh), the search
 * filter, the safe participant resolver and the unread/limit derivations. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useMessagesTab() {
  const { isAuthenticated, user, limits } = useAuthStore();
  const {
    threads,
    isLoading,
    hasLoadedThreads,
    fetchThreads,
    getUnreadCount,
    getOtherParticipant,
    dailyMessageCount,
  } = useMessagesStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        fetchThreads();
      }
    }, [isAuthenticated]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchThreads();
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

  const unreadCount = getUnreadCount();
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
