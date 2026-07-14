import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useCartStore } from '@/stores/cartStore';
import { useFavorites } from '@/hooks/useFavorites';
import { useUnreadCountQuery } from '@/hooks/messaging';

/**
 * Header rozet sayaçları: sepet / favori / mesaj / bildirim. Favoriler `useFavorites`,
 * mesaj okunmamış sayısı `useUnreadCountQuery` (#77) — ikisi de React Query,
 * enabled:isAuthenticated ile kendi kendine çeker (ayrı fetch effect'i gerekmez).
 */
export function useHomeBadges(isAuthenticated: boolean) {
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0);
  const cartProductIds = useMemo(() => new Set(cartItems.map((i) => i.productId)), [cartItems]);

  const { items: favItems } = useFavorites();
  const favCount = favItems.length;
  const { data: messageUnreadCount = 0 } = useUnreadCountQuery();

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
