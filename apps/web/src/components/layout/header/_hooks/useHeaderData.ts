"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { useCart } from "@/hooks/useCart";
import { wishlistApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useHeaderBadgeCounts } from "@/hooks/useHeaderBadgeCounts";

/**
 * The shared header data hook: auth (from the auth store, gated behind hydration
 * so SSR and first client render match) plus every badge count the header and
 * its children render — unread messages, unread notifications, pending
 * offers/trades (socket-refreshed TanStack queries with a slow polling
 * fallback), the cart count (from the cart store) and the wishlist count.
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
  const badgeCounts = useHeaderBadgeCounts(showAuthUI);

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

  useEffect(() => {
    if (isAuthenticated) {
      // Sepeti uygulama açılışında yükle ki navbar rozeti ürün sayısını
      // göstersin ve ürün detayında "Sepetten Çıkar" doğru görünsün.
      fetchCart();
    }
  }, [isAuthenticated, fetchCart]);

  return {
    isAuthenticated,
    user,
    showAuthUI,
    ...badgeCounts,
    cartCount,
    wishlistCount,
  };
}

export type HeaderData = ReturnType<typeof useHeaderData>;
