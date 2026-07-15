"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { useCart } from "@/hooks/useCart";
import { messagesApi, api, wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * The shared header data hook: auth (from the auth store, gated behind hydration
 * so SSR and first client render match) plus every badge count the header and
 * its children render — unread messages, unread notifications, pending
 * offers/trades (polled every 30s while authenticated), the cart count (from
 * the cart store) and the wishlist count (query gated on `showAuthUI`).
 *
 * Called once in `Header` and passed down as props, replacing the old
 * NavbarContext + useNavbarCounts split (no context layer).
 */
export function useHeaderData() {
  const { isAuthenticated, user, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Defer auth-dependent UI until after hydration so server and first client
  // render always match (avoids hydration error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const showAuthUI = mounted && isAuthenticated;

  const { itemCount: cartCount, refetch: fetchCart } = useCart();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [pendingTradesCount, setPendingTradesCount] = useState(0);

  const wishlistQuery = useQuery({
    queryKey: queryKeys.wishlist.all(),
    queryFn: async () => {
      const res = await wishlistApi.get();
      const data = res.data;
      const items =
        data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      return Array.isArray(items) ? items : [];
    },
    enabled: showAuthUI,
    meta: { page: "navbar-wishlist-count" },
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
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch unread message count:", error);
    }
  };

  const fetchPendingCounts = async () => {
    try {
      const [offersRes, tradesRes, notificationsRes] = await Promise.all([
        api.get("/offers/pending-count").catch(() => null),
        api.get("/trades/pending-count").catch(() => null),
        api.get("/notifications/unread-count").catch(() => null),
      ]);
      setPendingOffersCount(offersRes?.data?.received || 0);
      setPendingTradesCount(tradesRes?.data?.received || 0);
      setUnreadNotificationsCount(
        notificationsRes?.data?.count ??
          notificationsRes?.data?.unreadCount ??
          0,
      );
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to fetch pending counts:", error);
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
    isAuthenticated,
    user,
    showAuthUI,
    unreadMessageCount,
    unreadNotificationsCount,
    pendingOffersCount,
    pendingTradesCount,
    cartCount,
    wishlistCount,
  };
}

export type HeaderData = ReturnType<typeof useHeaderData>;
