"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { useCart } from "@/hooks/useCart";
import { wishlistItemsQuery } from "@/lib/wishlist";
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
  // whenever the store disagrees with the session (`reconcileSession`): a
  // stale guest store while the marker says signed in, a signed-in store
  // after another tab signed out (marker gone) or switched account (snapshot
  // of another user). It runs on tab focus/visibility, bfcache restore
  // (pageshow), SPA route changes and `storage` events, which fire here at
  // once when another tab writes or removes the user snapshot. Without this,
  // a transient guest resolution would stick showing "sign in", and another
  // tab's sign-out would leave this tab showing the old account and its
  // cached data.
  useEffect(() => {
    const reconcile = () => useAuthStore.getState().reconcileSession();
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    useAuthStore.getState().checkAuth();

    window.addEventListener("focus", reconcile);
    window.addEventListener("pageshow", reconcile);
    window.addEventListener("storage", reconcile);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("pageshow", reconcile);
      window.removeEventListener("storage", reconcile);
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
    useAuthStore.getState().reconcileSession();
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
    ...wishlistItemsQuery,
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
