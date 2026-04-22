"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { motion } from "framer-motion";
import {
  HeartIcon,
  TrashIcon,
  ShoppingCartIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { wishlistApi, listingsApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";
import { useTranslation } from "@/i18n";
import { formatCondition } from "@/lib/format";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { Button } from "@tarodan/ui";

interface WishlistItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productPrice: number;
  productOriginalPrice?: number;
  productCondition?: string;
  productStatus?: string;
  sellerId: string;
  sellerName: string;
  addedAt: string | Date;
}

export default function FavoritesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { addToCart } = useCartStore();
  const { t, locale } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sharedIds = useMemo(() => {
    const ids = searchParams.get("ids");
    if (!ids) return null;
    return ids.split(",").filter(Boolean);
  }, [searchParams]);

  const isSharedView = sharedIds !== null && sharedIds.length > 0;

  useEffect(() => {
    if (!mounted || authLoading || isSharedView) return;
    if (!isAuthenticated) {
      toast.error(t("favorites.loginRequired"));
      router.push("/login?redirect=/favorites");
    }
  }, [mounted, isAuthenticated, authLoading, isSharedView, router, t]);

  const wishlistQuery = useQuery({
    queryKey: ["wishlist"],
    queryFn: async (): Promise<WishlistItem[]> => {
      const response = await wishlistApi.get();
      const wishlistItems =
        response.data?.items || response.data?.data || response.data || [];
      const validItems = (
        Array.isArray(wishlistItems) ? wishlistItems : []
      ).filter((item: any) => item && item.productId && item.productTitle);
      return validItems;
    },
    enabled: !authLoading && isAuthenticated && !isSharedView,
    meta: { page: "favorites" },
  });

  const sharedProductsQuery = useQuery({
    queryKey: ["favorites-shared", sharedIds?.join(",")],
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

  const handleRemove = async (productId: string) => {
    try {
      await wishlistApi.remove(productId);
      toast.success(t("product.removedFromFavorites"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
        queryClient.invalidateQueries({
          queryKey: ["wishlist-check", productId],
        }),
      ]);
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to remove from favorites:", error);
      const message =
        error?.response?.data?.message || t("common.operationFailed");
      toast.error(message);
    }
  };

  const handleAddToCart = async (item: WishlistItem) => {
    try {
      await addToCart(item.productId);
      toast.success(t("product.addedToCart"));
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to add to cart:", error);
      const message =
        error?.response?.data?.message || t("common.operationFailed");
      toast.error(message);
    }
  };

  const getImageUrl = (productImage?: string): string => {
    if (!productImage) {
      return "https://placehold.co/400x400/f3f4f6/9ca3af?text=Product";
    }
    return productImage;
  };

  const showPlaceholder =
    !isSharedView && (!mounted || authLoading || !isAuthenticated);
  if (showPlaceholder) {
    return (
      <div className="min-h-screen bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="animate-pulse text-muted text-sm">
            {locale === "en" ? "Loading..." : "Yükleniyor..."}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-40 sm:h-64 bg-border-subtle rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold mb-2">
              {isSharedView
                ? t("favorites.sharedList")
                : t("favorites.myFavorites")}
            </h1>
            <p className="text-muted">
              {items.length} {t("favorites.itemsInFavorites")}
            </p>
          </div>
          {!isSharedView && items.length > 0 && (
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                const url = `${typeof window !== "undefined" ? window.location.origin : ""}/favorites?ids=${items.map((i) => i.productId).join(",")}`;
                navigator.clipboard.writeText(url).then(
                  () => toast.success(t("favorites.linkCopied")),
                  () => toast.error(t("common.operationFailed")),
                );
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-surface-alt hover:bg-border-subtle text-body font-medium rounded-xl transition-colors"
            >
              <ShareIcon className="w-5 h-5" />
              {t("favorites.shareList")}
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 bg-surface-elevated rounded-xl">
            <HeartIcon className="w-16 h-16 text-border-strong mx-auto mb-4" />
            <p className="text-muted text-lg mb-4">{t("favorites.empty")}</p>
            <Link
              href="/listings"
              className="inline-block px-6 py-3 bg-primary-500 text-inverted rounded-xl hover:bg-primary-600"
            >
              {t("favorites.browseProducts")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {items.map((item, index) => {
              return (
                <motion.div
                  key={item.id || index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-surface-elevated rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <Link href={`/listings/${item.productId}`}>
                    <div className="relative aspect-square bg-surface-alt">
                      <OptimizedImage
                        src={getImageUrl(item.productImage)}
                        alt={item.productTitle || "Product"}
                        fill
                        className="object-cover"
                        fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Product"
                        logContext={{ itemId: item.id, page: "favorites" }}
                      />
                      {!isSharedView && (
                        <Button
                          variant="secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemove(item.productId);
                          }}
                          className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 p-1.5 sm:p-2 bg-surface-elevated rounded-full shadow-md hover:bg-danger-50 transition-colors z-10"
                          title={t("favorites.removeFromFavorites")}
                        >
                          <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5 text-danger-500" />
                        </Button>
                      )}
                    </div>
                  </Link>
                  <div className="p-2.5 sm:p-4">
                    <Link href={`/listings/${item.productId}`}>
                      <h3 className="font-semibold text-heading line-clamp-2 mb-1.5 sm:mb-2 text-xs sm:text-sm hover:text-primary-500">
                        {item.productTitle || "Product"}
                      </h3>
                    </Link>
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className="flex flex-col">
                        {item.productOriginalPrice &&
                          item.productOriginalPrice > item.productPrice && (
                            <div className="flex items-center gap-1 sm:gap-2">
                              <span className="text-[10px] sm:text-sm text-subtle line-through">
                                {Number(
                                  item.productOriginalPrice,
                                ).toLocaleString("tr-TR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                })}{" "}
                                TL
                              </span>
                              <span className="text-[10px] sm:text-xs font-semibold text-inverted bg-danger-500 px-1 sm:px-1.5 py-0.5 rounded">
                                %
                                {Math.round(
                                  ((item.productOriginalPrice -
                                    item.productPrice) /
                                    item.productOriginalPrice) *
                                    100,
                                )}
                              </span>
                            </div>
                          )}
                        <p className="text-base sm:text-xl font-bold text-primary-500">
                          {Number(item.productPrice || 0).toLocaleString(
                            "tr-TR",
                            {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            },
                          )}{" "}
                          TL
                        </p>
                      </div>
                      {item.productCondition && (
                        <span className="text-[10px] sm:text-xs text-muted bg-surface-alt px-1.5 sm:px-2 py-0.5 sm:py-1 rounded hidden sm:inline">
                          {formatCondition(item.productCondition, locale)}
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={() => handleAddToCart(item)}
                      className="w-full text-xs sm:text-sm py-1.5 sm:py-2 flex gap-1.5 sm:gap-2"
                    >
                      <ShoppingCartIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {t("product.addToCart")}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
