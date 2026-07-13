import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

/**
 * Collections-browse controller — owns the /collections/browse query with the
 * search + filter (all/popular/recent), the client-side filter, and the premium
 * gate. Lifted verbatim from the monolithic screen (§12).
 */
export function useCollectionsBrowse() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'popular' | 'recent'>('all');
  const { isAuthenticated, user } = useAuthStore();
  // Premium/business üyeler zaten koleksiyon oluşturabildiği için upsell'i gizle.
  const isPremiumMember = user?.membershipTier === 'premium' || user?.membershipTier === 'business';

  const { data: apiCollections, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['collections', searchQuery, activeFilter],
    queryFn: async () => {
      try {
        const response = await api.get('/collections/browse', {
          params: {
            q: searchQuery || undefined,
            sort:
              activeFilter === 'popular' ? 'popular' : activeFilter === 'recent' ? 'newest' : undefined,
          },
        });
        // API şekli: { collections, total, page, pageSize }
        return (
          response.data?.collections ??
          response.data?.data ??
          (Array.isArray(response.data) ? response.data : [])
        );
      } catch {
        return null;
      }
    },
  });

  const collections = Array.isArray(apiCollections) ? apiCollections : [];

  const filteredCollections = collections.filter(
    (c: any) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return {
    isAuthenticated,
    isPremiumMember,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    isLoading,
    isRefetching,
    refetch,
    filteredCollections,
  };
}

export type CollectionsBrowseController = ReturnType<typeof useCollectionsBrowse>;
