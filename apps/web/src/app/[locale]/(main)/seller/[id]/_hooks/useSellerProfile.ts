/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, listingsApi, ratingsApi, collectionsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/stores/authStore";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useLocale, useTranslations } from "next-intl";
import type { Product } from "@/types/product";
import type {
  Seller,
  UserRating,
  RatingStats,
  SellerCollection,
} from "../_lib/types";

/**
 * All data + actions for the public seller profile: profile (with a fallback to
 * the first product's embedded seller), products, follow state, reviews,
 * collections and rating stats — plus follow / message / report handlers gated
 * by the shared auth modal. The UI stays presentational.
 */
export function useSellerProfile() {
  const params = useParams();
  const sellerId = params.id as string;
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  const { requireAuth, authModal } = useAuthGate();
  const t = useTranslations();
  const locale = useLocale();

  const [showReportModal, setShowReportModal] = useState(false);
  const viewCountedRef = useRef(false);
  useEffect(() => {
    viewCountedRef.current = false;
  }, [sellerId]);

  const sellerQuery = useQuery({
    queryKey: queryKeys.seller.profile(sellerId),
    queryFn: async (): Promise<Seller | null> => {
      const [profileRes, ratingStatsRes] = await Promise.all([
        api.get(`/users/${sellerId}/profile`).catch(() => null),
        ratingsApi.getUserStats(sellerId).catch(() => null),
      ]);
      const statsData = ratingStatsRes?.data;
      if (profileRes?.data) {
        return {
          ...profileRes.data,
          stats: {
            ...profileRes.data.stats,
            averageRating:
              statsData?.averageScore ??
              profileRes.data.stats?.averageRating ??
              0,
            totalRatings:
              statsData?.totalRatings ??
              profileRes.data.stats?.totalRatings ??
              0,
          },
        };
      }
      const productsRes = await listingsApi.getAll({ sellerId, limit: 1 });
      const firstProduct =
        productsRes.data?.data?.[0] || productsRes.data?.products?.[0];
      if (firstProduct?.seller) {
        return {
          id: firstProduct.seller.id,
          displayName: firstProduct.seller.displayName,
          avatarUrl: firstProduct.seller.avatarUrl,
          createdAt: firstProduct.seller.createdAt || new Date().toISOString(),
          isVerified: firstProduct.seller.isVerified || false,
          isPremium: firstProduct.seller.isPremium || false,
          stats: {
            totalListings: 0,
            totalSales: 0,
            totalTrades: 0,
            averageRating:
              statsData?.averageScore ?? firstProduct.seller.rating ?? 0,
            totalRatings:
              statsData?.totalRatings ?? firstProduct.seller.totalRatings ?? 0,
          },
        };
      }
      return null;
    },
    enabled: !!sellerId,
    meta: { page: "seller-profile" },
  });
  const seller = sellerQuery.data ?? null;

  // Fire storefront view tracking once per seller visit (backend handles
  // self-view + bot + rate-limit guards; errors are ignored — non-critical).
  useEffect(() => {
    if (!sellerId || !seller || viewCountedRef.current) return;
    if (user?.id === sellerId) return;
    viewCountedRef.current = true;
    (async () => {
      try {
        const res = await api.post(`/users/${sellerId}/view`);
        const newCount = res.data?.storeViewCount;
        if (newCount !== undefined) {
          queryClient.setQueryData(
            queryKeys.seller.profile(sellerId),
            (old: Seller | undefined) =>
              old ? { ...old, storeViewCount: newCount } : old,
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [sellerId, seller, user?.id, queryClient]);

  const productsQuery = useQuery({
    queryKey: queryKeys.seller.products(sellerId),
    queryFn: async (): Promise<Product[]> => {
      const response = await listingsApi.getAll({ sellerId, limit: 50 });
      return response.data?.data || response.data?.products || [];
    },
    enabled: !!sellerId,
    meta: { page: "seller-products" },
  });
  const products = productsQuery.data ?? [];

  const followQuery = useQuery({
    queryKey: queryKeys.seller.follow(sellerId),
    queryFn: async () => {
      const response = await api.get(`/users/${sellerId}/follow`);
      return response.data.following as boolean;
    },
    enabled: !!sellerId && !!isAuthenticated && user?.id !== sellerId,
    meta: { page: "seller-follow" },
  });
  const isFollowing = followQuery.data ?? false;

  const reviewsQuery = useQuery({
    queryKey: queryKeys.seller.reviews(sellerId),
    queryFn: async (): Promise<UserRating[]> => {
      const response = await ratingsApi.getUserRatings(sellerId);
      return response.data?.ratings || response.data?.data || [];
    },
    enabled: !!sellerId,
    meta: { page: "seller-reviews" },
  });

  const collectionsQuery = useQuery({
    queryKey: queryKeys.seller.collections(sellerId),
    queryFn: async (): Promise<SellerCollection[]> => {
      const response = await collectionsApi.getUserCollections(sellerId, {
        pageSize: 50,
      });
      return (
        response.data?.collections || response.data?.data?.collections || []
      );
    },
    enabled: !!sellerId,
    meta: { page: "seller-collections" },
  });

  const ratingStatsQuery = useQuery({
    queryKey: queryKeys.seller.ratingStats(sellerId),
    queryFn: async (): Promise<RatingStats | null> => {
      const res = await ratingsApi.getUserStats(sellerId);
      return res.data;
    },
    enabled: !!sellerId,
    meta: { page: "seller-rating-stats" },
  });

  const [followPending, setFollowPending] = useState(false);
  const handleFollow = async () => {
    if (!requireAuth({ message: t("auth.authRequiredMessage") })) return;
    setFollowPending(true);
    try {
      if (isFollowing) {
        await api.delete(`/users/${sellerId}/follow`);
        toast.success(t("seller.unfollowed"));
      } else {
        await api.post(`/users/${sellerId}/follow`);
        toast.success(t("seller.followed"));
      }
      // Keep the button disabled until the follow state has actually refetched.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.seller.follow(sellerId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.seller.profile(sellerId),
        }),
      ]);
    } catch {
      toast.error(t("common.operationFailed"));
    } finally {
      setFollowPending(false);
    }
  };

  const handleMessage = () => {
    if (!requireAuth({ message: t("auth.authRequiredMessage") })) return;
    window.location.href = `/profile/messages?user=${sellerId}`;
  };

  const handleReport = () => {
    if (!requireAuth({ message: t("auth.authRequiredMessage") })) return;
    setShowReportModal(true);
  };

  const membershipDuration = (() => {
    if (!seller?.createdAt) return t("seller.newMember");
    const created = new Date(seller.createdAt);
    const now = new Date();
    const months =
      (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth());
    if (months < 1) return t("seller.newMember");
    if (months < 12) return t("seller.monthsCount", { count: months });
    return t("seller.yearsCount", { count: Math.floor(months / 12) });
  })();

  return {
    t,
    locale,
    sellerId,
    seller,
    isLoading: sellerQuery.isLoading,
    products,
    isFollowing,
    followPending,
    reviews: reviewsQuery.data ?? [],
    reviewsLoading: reviewsQuery.isLoading,
    collections: collectionsQuery.data ?? [],
    collectionsLoading: collectionsQuery.isLoading,
    ratingStats: ratingStatsQuery.data ?? null,
    isOwnProfile: user?.id === sellerId,
    membershipDuration,
    showReportModal,
    setShowReportModal,
    authModal,
    handleFollow,
    handleMessage,
    handleReport,
  };
}
