/** @format */

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { wishlistItemsQuery, type WishlistEntry } from "@/lib/wishlist";
import { useToggleWishlist } from "@/hooks/useWishlist";
import { useAuthStore } from "@/stores/authStore";
import { useCart } from "@/hooks/useCart";
import { useLocale, useTranslations } from "next-intl";
import type { WishlistItem } from "@/components/favorites/types";
import { MAX_SHARED_FAVORITES } from "@/lib/share";
import { publicNameOf } from "@/lib/public-name";

/**
 * Favorilerim yalnız tam satırları çizer: kartta favorilenen ürünün iyimser
 * (yalnız `productId`'li) satırı, gerçek satır gelene kadar burada görünmez.
 */
const selectWishlistItems = (items: readonly WishlistEntry[]): WishlistItem[] =>
  items.filter(
    (item): item is WishlistEntry & WishlistItem =>
      typeof item.productTitle === "string" && !!item.productTitle,
  );

/**
 * Favorites data: the user's wishlist OR a shared read-only list (`?ids=`), plus
 * the remove action and add-to-cart handler. The list is the shared
 * `wishlistItemsQuery` (same cache as the header badge and the card hearts) and
 * removal goes through the shared `useToggleWishlist` (optimistic + rollback).
 */
export function useFavorites() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    addToCart,
    removeFromCart,
    removeFromOfflineCart,
    items: cartItems,
    offlineItems,
  } = useCart();
  const t = useTranslations();

  const sharedIds = useMemo(() => {
    const ids = searchParams.get("ids");
    if (!ids) return null;
    // Paylaşılan linkte en fazla MAX_SHARED_FAVORITES ürün (N istek sınırı).
    return ids.split(",").filter(Boolean).slice(0, MAX_SHARED_FAVORITES);
  }, [searchParams]);
  const isSharedView = sharedIds !== null && sharedIds.length > 0;

  const wishlistQuery = useQuery({
    ...wishlistItemsQuery,
    select: selectWishlistItems,
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
    : (wishlistQuery.data ?? []);
  const isLoading = isSharedView
    ? sharedProductsQuery.isLoading
    : wishlistQuery.isLoading;

  const toggleWishlist = useToggleWishlist();

  const inCartIds = useMemo(
    () =>
      new Set<string>([
        ...cartItems.map((ci) => ci.productId),
        ...offlineItems.map((ci) => ci.productId),
      ]),
    [cartItems, offlineItems],
  );
  const isInCart = (productId: string) => inCartIds.has(productId);

  // Toggle like the product detail page: add when absent, remove (from the
  // authed or the guest cart, whichever holds it) when present.
  const handleCartToggle = async (item: WishlistItem) => {
    try {
      if (isInCart(item.productId)) {
        if (cartItems.some((ci) => ci.productId === item.productId)) {
          await removeFromCart(item.productId);
        } else {
          removeFromOfflineCart(item.productId);
        }
        toast.success(t("product.removedFromCart"));
      } else {
        await addToCart(item.productId);
        toast.success(t("product.addedToCart"));
      }
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to update cart:", error);
      toast.error(
        error?.response?.data?.message || t("common.operationFailed"),
      );
    }
  };

  return {
    items,
    isLoading,
    isSharedView,
    isAuthenticated,
    authLoading,
    handleRemove: (productId: string) => {
      toggleWishlist(productId, true);
    },
    handleCartToggle,
    isInCart,
  };
}
