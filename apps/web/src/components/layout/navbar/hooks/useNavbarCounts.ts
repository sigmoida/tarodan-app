'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { messagesApi, api, wishlistApi } from '@/lib/api';

/**
 * Owns the navbar badge counts: unread messages, unread notifications, pending
 * offers/trades (polled every 30s while authenticated), plus the cart count
 * (from the cart store) and the wishlist count (query gated on `showAuthUI`).
 */
export function useNavbarCounts(showAuthUI: boolean) {
  const { isAuthenticated } = useAuthStore();
  const { itemCount: cartCount, fetchCart } = useCartStore();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [pendingTradesCount, setPendingTradesCount] = useState(0);

  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      const res = await wishlistApi.get();
      const data = res.data;
      const items = data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      return Array.isArray(items) ? items : [];
    },
    enabled: showAuthUI,
    meta: { page: 'navbar-wishlist-count' },
  });
  const wishlistCount = wishlistQuery.data?.length ?? 0;

  const fetchUnreadMessageCount = async () => {
    try {
      const response = await messagesApi.getThreads();
      const threads = response.data.data || response.data.threads || [];
      const totalUnread = threads.reduce((sum: number, thread: any) => {
        return sum + (thread.unreadCount || 0);
      }, 0);
      setUnreadMessageCount(totalUnread);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch unread message count:', error);
    }
  };

  const fetchPendingCounts = async () => {
    try {
      const [offersRes, tradesRes, notificationsRes] = await Promise.all([
        api.get('/offers/pending-count').catch(() => null),
        api.get('/trades/pending-count').catch(() => null),
        api.get('/notifications/unread-count').catch(() => null),
      ]);
      setPendingOffersCount(offersRes?.data?.received || 0);
      setPendingTradesCount(tradesRes?.data?.received || 0);
      setUnreadNotificationsCount(notificationsRes?.data?.count ?? notificationsRes?.data?.unreadCount ?? 0);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to fetch pending counts:', error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      // Sepeti uygulama açılışında yükle ki navbar rozeti ürün sayısını
      // göstersin ve ürün detayında "Sepetten Çıkar" doğru görünsün.
      fetchCart();
      fetchUnreadMessageCount();
      fetchPendingCounts();
      // Poll for new messages and pending counts every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadMessageCount();
        fetchPendingCounts();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadMessageCount(0);
      setPendingOffersCount(0);
      setPendingTradesCount(0);
    }
  }, [isAuthenticated]);

  return {
    unreadMessageCount,
    unreadNotificationsCount,
    pendingOffersCount,
    pendingTradesCount,
    cartCount,
    wishlistCount,
  };
}
