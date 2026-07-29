"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { hasAuthMarker } from "@/lib/authMarker";
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
  const { isAuthenticated, user } = useAuthStore();
  const pathname = usePathname();

  // Initial auth check + self-heal. `checkAuth` runs once on mount, then again
  // whenever the session marker says "logged in" but the client store has
  // fallen out of sync to guest — on tab focus/visibility, bfcache restore
  // (pageshow) and SPA route changes. Without this, a single transient guest
  // resolution (e.g. the `tarodan_authed` marker briefly unreadable while the
  // BFF proxy refreshes the session) would stick for the whole SPA session,
  // showing "Giriş Yap" until a hard reload.
  useEffect(() => {
    const reconcile = () => {
      const s = useAuthStore.getState();
      if (!s.isAuthenticated && hasAuthMarker()) s.checkAuth();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    useAuthStore.getState().checkAuth();

    window.addEventListener("focus", reconcile);
    window.addEventListener("pageshow", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("pageshow", reconcile);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Re-check on client-side navigation: the header never remounts across SPA
  // route changes, so a stale guest store would otherwise never recover.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const s = useAuthStore.getState();
    if (!s.isAuthenticated && hasAuthMarker()) s.checkAuth();
  }, [pathname]);

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
