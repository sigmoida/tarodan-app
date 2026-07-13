import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { userApi, productsApi, ratingsApi, collectionsApi } from '@/services/api';
import { qk } from '@/lib/query';
import { useRefresh } from '@/hooks/useRefresh';
import { useFollowing } from '@/hooks/useFollowing';
import { useAuthStore } from '@/stores/authStore';

/**
 * Seller profile controller — owns the 5 public-profile queries (seller,
 * products, rating stats, ratings, collections), pull-to-refresh, active tab,
 * and the message handler. Lifted verbatim from the monolithic screen.
 */
export function useSellerProfile() {
  const { id } = useLocalSearchParams();
  const sellerId = String(id ?? '');
  const { isAuthenticated } = useAuthStore();
  const { isFollowing, followSeller, unfollowSeller } = useFollowing();
  const [activeTab, setActiveTab] = useState<'listings' | 'reviews' | 'collections'>('listings');
  const [followBusy, setFollowBusy] = useState(false);

  const { data: apiSeller, isLoading, refetch: refetchSeller } = useQuery({
    queryKey: qk.seller.detail(sellerId),
    queryFn: async () => {
      try {
        // Web `userApi.getPublicProfile` ile aynı: GET /users/:id/profile
        const response = await userApi.getPublicProfile(String(id));
        return (response.data as any)?.data || response.data;
      } catch (error) {
        console.log('⚠️ Satıcı bilgisi yüklenemedi, mock data kullanılacak');
        return null;
      }
    },
    retry: 1,
  });

  const { data: sellerProducts, refetch: refetchProducts } = useQuery({
    queryKey: qk.seller.products(sellerId),
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ sellerId: id });
        const data: any = response.data;
        return data?.data ?? data?.items ?? data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  // Web `apps/web/src/app/seller/[id]/page.tsx:181-193` paritesi
  const { data: ratingStats, refetch: refetchStats } = useQuery({
    queryKey: qk.seller.ratingStats(sellerId),
    queryFn: async () => {
      try {
        const response = await ratingsApi.getUserStats(String(id));
        return (response.data as any)?.data ?? response.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  const { data: ratingList, refetch: refetchRatings } = useQuery({
    queryKey: qk.seller.ratings(sellerId),
    queryFn: async () => {
      try {
        const response = await ratingsApi.getUserRatings(String(id), { limit: 20 });
        const data: any = response.data;
        // API şekli: { ratings, total, page, pageSize } (olası interceptor sarmalını da aç)
        const payload = data?.data ?? data;
        return payload?.ratings ?? payload?.items ?? (Array.isArray(payload) ? payload : []);
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  // Satıcının herkese açık koleksiyonları (backend başkası bakınca yalnızca public döner)
  const { data: sellerCollections, refetch: refetchCollections } = useQuery({
    queryKey: qk.seller.collections(sellerId),
    queryFn: async () => {
      try {
        const response = await collectionsApi.getUserCollections(String(id), { pageSize: 50 });
        const data: any = response.data;
        const payload = data?.data ?? data;
        return payload?.collections ?? (Array.isArray(payload) ? payload : []);
      } catch {
        return [];
      }
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(
    refetchSeller,
    refetchProducts,
    refetchStats,
    refetchRatings,
    refetchCollections,
  );

  const seller = apiSeller;
  const products = Array.isArray(sellerProducts) ? sellerProducts : [];
  // Backend ratings (web ile parite); yoksa boş.
  const reviews = Array.isArray(ratingList) ? ratingList : [];
  const collections = Array.isArray(sellerCollections) ? sellerCollections : [];

  const handleMessage = () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    router.push(`/messages/new?sellerId=${id}`);
  };

  const isFollowingSeller = isFollowing(String(id));

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      if (isFollowingSeller) {
        await unfollowSeller(String(id));
      } else {
        await followSeller(String(id));
      }
    } finally {
      setFollowBusy(false);
    }
  };

  return {
    isAuthenticated,
    isLoading,
    seller,
    products,
    reviews,
    collections,
    ratingStats,
    activeTab,
    setActiveTab,
    refreshing,
    onRefresh,
    handleMessage,
    isFollowingSeller,
    followBusy,
    handleToggleFollow,
  };
}

export type SellerProfileController = ReturnType<typeof useSellerProfile>;
