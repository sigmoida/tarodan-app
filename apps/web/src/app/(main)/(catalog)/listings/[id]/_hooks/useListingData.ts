/** @format */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { listingsApi, wishlistApi, userApi, api } from "@/lib/api";
import { getProductEffectivePrice } from "@/lib/productPrice";
import { buildImages } from "../_lib/images";
import type { Listing } from "../_lib/types";

/**
 * The listing detail's data layer: the listing itself (public → owner fallback),
 * a one-shot view count, the wishlist flag, and the reviews list/stats with their
 * sort + score filters. The queryFn is a pure fetch so the server prefetch
 * hydrates without a refetch flash; the view count is a separate effect so
 * SSR-hydrated loads still count exactly once and the server never double-counts.
 */
export function useListingData(id: string, isAuthenticated: boolean) {
  const queryClient = useQueryClient();
  const viewCountedRef = useRef(false);

  const [reviewSortBy, setReviewSortBy] = useState("newest");
  const [reviewFilterScore, setReviewFilterScore] = useState<number | null>(
    null,
  );

  useEffect(() => {
    viewCountedRef.current = false;
  }, [id]);

  const listingQuery = useQuery({
    queryKey: queryKeys.product.detail(id),
    queryFn: async (): Promise<Listing> => {
      let response;
      try {
        response = await listingsApi.getOne(id);
      } catch (err: any) {
        // Public uç pending / pasif (stoklu) ilanı döndürmez. Sahibi kendi
        // ilanını yine de görebilsin: owner ucuna düş. Sahip değilse/giriş
        // yoksa bu da hata verir ve "İlan bulunamadı" gösterilir.
        const sts = err?.response?.status;
        if (sts === 404 || sts === 403) {
          response = await userApi.getMyProductById(id);
        } else {
          throw err;
        }
      }
      return response.data.product || response.data;
    },
    enabled: !!id,
    meta: { page: "listing-detail" },
  });

  // Count a view once per listing, whether from SSR hydration or a client fetch.
  useEffect(() => {
    if (!id || !listingQuery.data || viewCountedRef.current) return;
    viewCountedRef.current = true;
    (async () => {
      try {
        const viewResponse = await api.post(`/products/${id}/view`);
        const newCount = viewResponse.data?.viewCount;
        if (newCount !== undefined) {
          queryClient.setQueryData(
            queryKeys.product.detail(id),
            (old: Listing | undefined) =>
              old ? { ...old, viewCount: newCount } : old,
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [id, listingQuery.data, queryClient]);

  const listing = listingQuery.data ?? null;
  const effectivePrice = listing ? getProductEffectivePrice(listing) : 0;
  const isTradeAvailable =
    listing?.trade_available || listing?.isTradeEnabled || false;

  const images = useMemo(() => buildImages(listing?.images), [listing]);

  const wishlistQuery = useQuery({
    queryKey: queryKeys.wishlist.check(id),
    queryFn: async () => {
      const response = await wishlistApi.check(id);
      return response.data?.inWishlist ?? false;
    },
    enabled: !!id && !!isAuthenticated,
    meta: { page: "listing-detail-wishlist" },
  });
  const isFavorite = wishlistQuery.data ?? false;

  const reviewsQuery = useQuery({
    queryKey: queryKeys.product.reviews(id, reviewSortBy, reviewFilterScore),
    queryFn: async () => {
      const params: Record<string, any> = { sortBy: reviewSortBy };
      if (reviewFilterScore) params.score = reviewFilterScore;
      const [reviewsRes, statsRes] = await Promise.all([
        api.get(`/ratings/products/${id}`, { params }),
        api.get(`/ratings/products/${id}/stats`),
      ]);
      const reviewsList =
        reviewsRes.data?.ratings || reviewsRes.data?.data || [];
      const stats = statsRes.data;
      return {
        reviews: reviewsList,
        stats: stats
          ? {
              averageRating: stats.averageScore || 0,
              totalRatings: stats.totalRatings || 0,
              scoreDistribution: stats.scoreDistribution,
            }
          : null,
      };
    },
    enabled: !!id,
    meta: { page: "listing-detail-reviews" },
  });

  return {
    listingQuery,
    listing,
    isLoading: listingQuery.isLoading,
    effectivePrice,
    isTradeAvailable,
    images,
    isFavorite,
    reviews: reviewsQuery.data?.reviews ?? [],
    reviewStats: reviewsQuery.data?.stats ?? null,
    reviewsLoading: reviewsQuery.isLoading,
    reviewSortBy,
    setReviewSortBy,
    reviewFilterScore,
    setReviewFilterScore,
  };
}
