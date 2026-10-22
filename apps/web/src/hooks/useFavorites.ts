/** @format */

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { wishlistItemsQuery } from "@/lib/wishlist";
import { useToggleWishlist, useWishlistPendingIds } from "@/hooks/useWishlist";
import { useAuthStore } from "@/stores/authStore";
import type { WishlistItem } from "@/components/favorites/types";
import { selectFavoritesView } from "@/components/favorites/select";
import { MAX_SHARED_FAVORITES } from "@/lib/share";
import { publicNameOf } from "@/lib/public-name";

/**
 * Favorites data: the user's wishlist OR a shared read-only list (`?ids=`), plus
 * the remove action (each card's cart toggle is the shared
 * `ProductCardCartButton`). The list is the shared
 * `wishlistItemsQuery` (same cache as the header badge and the card hearts) and
 * removal goes through the shared `useToggleWishlist` (optimistic + rollback).
 *
 * `pendingCount` = optimistic adds whose real row hasn't arrived yet; the page
 * shows them as loading tiles so its count matches the header badge.
 * `isPending(productId)` = a favorite request for that product is in flight;
 * the remove button shows busy and a second click is ignored.
 */
export function useFavorites() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const sharedIds = useMemo(() => {
    const ids = searchParams.get("ids");
    if (!ids) return null;
    // Paylaşılan linkte en fazla MAX_SHARED_FAVORITES ürün (N istek sınırı).
    return ids.split(",").filter(Boolean).slice(0, MAX_SHARED_FAVORITES);
  }, [searchParams]);
  const isSharedView = sharedIds !== null && sharedIds.length > 0;

  const wishlistQuery = useQuery({
    ...wishlistItemsQuery,
    select: selectFavoritesView,
    enabled: !authLoading && isAuthenticated && !isSharedView,
    meta: { page: "favorites" },
  });

  const sharedProductsQuery = useQuery({
    queryKey: queryKeys.wishlist.shared(sharedIds?.join(",")),
    queryFn: async (): Promise<WishlistItem[]> => {
      if (!sharedIds?.length) return [];
      const results = await Promise.allSettled(
        sharedIds.map((id) => listingsApi.getById(id).then((r) => r.data)),
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<any> =>
            r.status === "fulfilled" && r.value,
        )
        .map((r) => {
          const p = r.value;
          return {
            id: p.id,
            productId: p.id,
            productTitle: p.title,
            productImage:
              p.images?.[0]?.cardUrl ??
              p.images?.[0]?.detailUrl ??
              p.images?.[0]?.url ??
              p.imageUrl,
            productPrice: p.price ?? p.sellingPrice,
            productOriginalPrice: p.originalPrice,
            productCondition: p.condition,
            productStatus: p.status,
            availableQuantity: p.availableQuantity,
            sellerId: p.sellerId ?? p.userId,
            sellerName: publicNameOf(p.seller, p.sellerName ?? ""),
            addedAt: p.createdAt,
          };
        });
    },
    enabled: isSharedView && (sharedIds?.length ?? 0) > 0,
    meta: { page: "favorites-shared" },
  });

  const items = isSharedView
    ? (sharedProductsQuery.data ?? [])
    : (wishlistQuery.data?.items ?? []);
  const pendingCount = isSharedView
    ? 0
    : (wishlistQuery.data?.pendingCount ?? 0);
  const isLoading = isSharedView
    ? sharedProductsQuery.isLoading
    : wishlistQuery.isLoading;

  const toggleWishlist = useToggleWishlist();
  const pendingIds = useWishlistPendingIds();

  return {
    items,
    pendingCount,
    isLoading,
    isSharedView,
    isAuthenticated,
    authLoading,
    isPending: (productId: string) => pendingIds.has(productId),
    /** `false` = aynı ürün için istek sürüyor, tıklama yok sayıldı. */
    handleRemove: (productId: string) => toggleWishlist(productId, true),
  };
}
