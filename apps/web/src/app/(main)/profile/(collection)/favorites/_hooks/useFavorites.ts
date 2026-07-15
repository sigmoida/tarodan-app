/** @format */

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { wishlistApi, listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useCart } from "@/hooks/useCart";
import { useLocale, useTranslations } from "next-intl";
import type { WishlistItem } from "../_lib/types";

/**
 * Favorites data: the user's wishlist OR a shared read-only list (`?ids=`), plus
 * the remove mutation and add-to-cart handler. Replaces the page's inline
 * queries + hand-rolled `wishlistApi.remove` call.
 */
export function useFavorites() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { addToCart } = useCart();
  const t = useTranslations();

  const sharedIds = useMemo(() => {
    const ids = searchParams.get("ids");
    if (!ids) return null;
    return ids.split(",").filter(Boolean);
  }, [searchParams]);
  const isSharedView = sharedIds !== null && sharedIds.length > 0;

  const wishlistQuery = useQuery({
    queryKey: queryKeys.wishlist.all(),
    queryFn: async (): Promise<WishlistItem[]> => {
      const response = await wishlistApi.get();
      const list =
        response.data?.items || response.data?.data || response.data || [];
      return (Array.isArray(list) ? list : []).filter(
        (item: any) => item && item.productId && item.productTitle,
      );
    },
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
            sellerName: p.seller?.displayName ?? p.sellerName ?? "",
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

  const removeMutation = useMutation({
    mutationFn: (productId: string) => wishlistApi.remove(productId),
    onSuccess: async (_data, productId) => {
      toast.success(t("product.removedFromFavorites"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wishlist.all() }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.wishlist.check(productId),
        }),
      ]);
    },
    onError: (error: any) => {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to remove from favorites:", error);
      toast.error(
        error?.response?.data?.message || t("common.operationFailed"),
      );
    },
  });

  const handleAddToCart = async (item: WishlistItem) => {
    try {
      await addToCart(item.productId);
      toast.success(t("product.addedToCart"));
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to add to cart:", error);
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
    handleRemove: (productId: string) => removeMutation.mutate(productId),
    handleAddToCart,
  };
}
