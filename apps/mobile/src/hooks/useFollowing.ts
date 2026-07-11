import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuthStore } from '@/stores/authStore';

export interface FollowedSeller {
  id: string;
  displayName: string;
  avatarUrl?: string;
  listingCount: number;
  rating?: number;
  followedAt: string;
}

/**
 * Takip edilen satıcılar — React Query destekli. Eskiden `followStore` (fetch
 * eden zustand) yapıyordu; Faz 1'de tek server-state disiplinine (TanStack Query)
 * taşındı ([[mobile-canonical-refactor-progress]] deseni; favorites ile aynı).
 * Davranış birebir korunur: follow/unfollow yerel cache'i günceller (store'da
 * olduğu gibi API DÖNÜŞÜNDEN SONRA — optimistic değil), 409 idempotent, 404
 * toleranslı. Public API (following/isFollowing/followSeller…) store ile aynıdır.
 */
export function useFollowing() {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const query = useQuery({
    queryKey: qk.follow.following,
    enabled: isAuthenticated,
    queryFn: async (): Promise<FollowedSeller[]> => {
      const response = await api.get('/users/me/following');
      const data = response.data?.data || response.data || [];
      return Array.isArray(data) ? data : [];
    },
  });

  const following: FollowedSeller[] = query.data ?? [];

  const readCache = (): FollowedSeller[] =>
    qc.getQueryData<FollowedSeller[]>(qk.follow.following) ?? [];

  const isFollowing = (sellerId: string) => readCache().some((f) => f.id === sellerId);
  const getFollowingCount = () => following.length;

  const fetchFollowing = () => query.refetch();

  const followSeller = async (sellerId: string): Promise<boolean> => {
    try {
      const response = await api.post(`/users/${sellerId}/follow`);
      // API dönüşünden sonra yerel state'e ekle (store paritesi).
      const newFollowing: FollowedSeller = response.data?.user || {
        id: sellerId,
        displayName: 'Satıcı',
        listingCount: 0,
        followedAt: new Date().toISOString(),
      };
      qc.setQueryData<FollowedSeller[]>(qk.follow.following, (cur) => [...(cur ?? []), newFollowing]);
      return true;
    } catch (error: any) {
      console.error('Failed to follow:', error);
      // Zaten takip ediliyorsa başarı (idempotent).
      if (error?.response?.status === 409) {
        return true;
      }
      return false;
    }
  };

  const unfollowSeller = async (sellerId: string): Promise<boolean> => {
    try {
      await api.delete(`/users/${sellerId}/follow`);
      qc.setQueryData<FollowedSeller[]>(qk.follow.following, (cur) =>
        (cur ?? []).filter((f) => f.id !== sellerId),
      );
      return true;
    } catch (error: any) {
      console.error('Failed to unfollow:', error);
      // Takip edilmiyorsa yine başarı + yerel listeden düş.
      if (error?.response?.status === 404) {
        qc.setQueryData<FollowedSeller[]>(qk.follow.following, (cur) =>
          (cur ?? []).filter((f) => f.id !== sellerId),
        );
        return true;
      }
      return false;
    }
  };

  return {
    following,
    isLoading: query.isLoading,
    error: query.isError ? 'Takip listesi yüklenemedi' : null,
    isFollowing,
    getFollowingCount,
    fetchFollowing,
    followSeller,
    unfollowSeller,
  };
}
