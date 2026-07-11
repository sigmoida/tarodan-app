import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, collectionsApi, membershipApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { ProfileCollection } from '../_lib/profileConstants';

/**
 * Profile data controller — owns the 4 profile queries (stats, trust,
 * collections, membership), the trust-visibility mutation, derived values, and
 * pull-to-refresh. Lifted verbatim from the monolithic ProfileScreen.
 */
export function useProfileData() {
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Web ile parite: sayaçlar kullanıcının kendi public profilinin stats objesinden
  // ({ totalListings, totalSales, totalTrades, averageRating, totalRatings }).
  // (business-stats yalnızca business tier'da çalışıyordu → premium/free'de boştu.)
  const { data: apiProfile } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: async () => {
      try {
        const response = await userApi.getPublicProfile(String(user?.id));
        // Tüm public profil gövdesi (stats + trustScore/trustLevel — trust premium+showTrustScore'a bağlı).
        return (response.data as any)?.data ?? (response.data as any) ?? null;
      } catch (error) {
        console.log('Stats API failed, using user data');
        return null;
      }
    },
    enabled: isAuthenticated && !!user?.id,
    retry: 1,
  });
  const apiStats = (apiProfile as any)?.stats ?? null;

  // Güven skoru + görünürlük: sahibin kendi /users/me yanıtından (web profil sayfası paritesi).
  // getPublicProfile sahibe de görünürlük kuralını uygular (gizliyken trustScore=null) → toggle kaybolurdu;
  // owner endpoint'i skoru her zaman döndüğü için toggle her durumda görünür kalır.
  const { data: meProfile } = useQuery({
    queryKey: ['me-trust', user?.id],
    queryFn: async () => {
      const response = await userApi.getProfile();
      return (response.data as any)?.data ?? (response.data as any) ?? null;
    },
    enabled: isAuthenticated && !!user?.id,
  });
  const isPremiumProfile: boolean = !!(meProfile as any)?.isPremium;
  const trustScore: number | null =
    typeof (meProfile as any)?.trustScore === 'number' ? (meProfile as any).trustScore : null;
  const trustLevel: string | null = (meProfile as any)?.trustLevel ?? null;
  const showTrustScore: boolean = (meProfile as any)?.showTrustScore !== false;

  // Güven skorunun herkese açık görünürlüğünü değiştir (web `toggleTrustVisibility` paritesi).
  const trustVisibilityMutation = useMutation({
    mutationFn: (next: boolean) => userApi.updateProfile({ showTrustScore: next }),
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: ['me-trust', user?.id] });
      const prev = queryClient.getQueryData(['me-trust', user?.id]);
      queryClient.setQueryData(['me-trust', user?.id], (old: any) =>
        old ? { ...old, showTrustScore: next } : old,
      );
      return { prev };
    },
    onError: (_err, _next, context: any) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(['me-trust', user?.id], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me-trust', user?.id] });
    },
  });

  // Kendi koleksiyonları (özel dahil — /collections/me sahibe hepsini döner).
  // Tek query hem garaj önizlemesini hem de sayaç kutucuğunu (total) besler.
  const { data: myCollections } = useQuery({
    queryKey: ['profile-collections', user?.id],
    queryFn: async () => {
      try {
        const res = await collectionsApi.getMyCollections({ pageSize: 10 });
        const body = res.data as
          | { collections?: ProfileCollection[]; total?: number; data?: ProfileCollection[]; meta?: { total?: number } }
          | ProfileCollection[]
          | undefined;
        if (Array.isArray(body)) return { items: body, total: body.length };
        const items = body?.collections ?? (Array.isArray(body?.data) ? body!.data! : []);
        const total = body?.total ?? body?.meta?.total ?? items.length;
        return { items, total };
      } catch {
        return { items: [] as ProfileCollection[], total: 0 };
      }
    },
    enabled: isAuthenticated,
    retry: 1,
  });
  const collectionItems: ProfileCollection[] = myCollections?.items ?? [];
  const collectionsCount: number = myCollections?.total ?? 0;

  const apiStatsObj = (apiStats as Record<string, number> | null) || null;
  const stats = {
    listings: apiStatsObj?.totalListings ?? (user as any)?.listingCount ?? 0,
    trades: apiStatsObj?.totalTrades ?? 0,
    rating: apiStatsObj?.averageRating ?? (user as any)?.rating ?? 0,
    collections: collectionsCount ?? 0,
    favorites: apiStatsObj?.favorites ?? 0,
    orders: apiStatsObj?.orders ?? user?.totalPurchases ?? 0,
  };

  // BUG-008: Efektif üyelik tier'ı — backend /membership/me past_due'yu free'ye
  // indirir (web ile parite). user.membershipTier bayat kalabilir; rozet/ikon
  // bunun yerine API'nin döndürdüğü efektif tier'ı kullanmalı.
  const { data: membershipData } = useQuery({
    queryKey: ['membership-me'],
    queryFn: async () => {
      try {
        const response = await membershipApi.getCurrentMembership();
        const body = response.data?.data ?? response.data ?? {};
        return (body?.tier?.type ?? body?.tierType ?? null) as string | null;
      } catch {
        return null;
      }
    },
    enabled: isAuthenticated,
    retry: 1,
  });
  const effectiveTier: string = membershipData ?? user?.membershipTier ?? 'free';
  const isPaidTier = effectiveTier === 'premium' || effectiveTier === 'business';
  const tierLabel = effectiveTier === 'business' ? 'Business' : 'Premium';

  // Aşağı çekince profildeki tüm sayaç/listeleri tazele (stats, garaj+koleksiyon
  // sayısı, üyelik tier'ı).
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['user-stats', user?.id] }),
        queryClient.refetchQueries({ queryKey: ['profile-collections', user?.id] }),
        queryClient.refetchQueries({ queryKey: ['membership-me'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return {
    isAuthenticated,
    user,
    stats,
    isPremiumProfile,
    trustScore,
    trustLevel,
    showTrustScore,
    trustVisibilityMutation,
    collectionItems,
    collectionsCount,
    effectiveTier,
    isPaidTier,
    tierLabel,
    refreshing,
    onRefresh,
  };
}
