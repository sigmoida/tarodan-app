import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useCartStore } from '@/stores/cartStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useMessagesStore } from '@/stores/messagesStore';

/**
 * Header rozet sayaçları: sepet / favori / mesaj / bildirim. favoritesStore ve
 * messagesStore şimdilik fetch ediyor (Faz 1'de query hook'una geçecek).
 */
export function useHomeBadges(isAuthenticated: boolean) {
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0);
  const cartProductIds = useMemo(() => new Set(cartItems.map((i) => i.productId)), [cartItems]);

  const favCount = useFavoritesStore((s) => s.items.length);
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  const messageUnreadCount = useMessagesStore((s) => s.totalUnreadCount);
  const fetchMessageUnreadCount = useMessagesStore((s) => s.fetchUnreadCount);

  useEffect(() => {
    if (isAuthenticated) fetchFavorites();
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAuthenticated) fetchMessageUnreadCount();
  }, [isAuthenticated, fetchMessageUnreadCount]);

  const { data: unreadData } = useQuery({
    queryKey: qk.notifications.unread,
    enabled: isAuthenticated,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const response = await notificationsApi.getUnreadCount();
        const body = response.data as { count?: number; data?: { count?: number } } | undefined;
        return body?.count ?? body?.data?.count ?? 0;
      } catch {
        return 0;
      }
    },
  });
  const unreadCount = typeof unreadData === 'number' ? unreadData : 0;

  return { cartCount, cartProductIds, favCount, messageUnreadCount, unreadCount };
}
