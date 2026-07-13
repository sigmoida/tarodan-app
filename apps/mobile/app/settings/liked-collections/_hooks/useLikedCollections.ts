import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { LikedCollection } from '../_lib/types';

/**
 * Liked-collections controller — owns the list query, unlike action, refresh
 * and focus refetch. Lifted verbatim from the monolithic screen (§12).
 */
export function useLikedCollections() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['liked-collections'],
    queryFn: async () => {
      try {
        const response = await collectionsApi.getLikedCollections();
        console.log('Liked collections response:', JSON.stringify(response.data).substring(0, 500));
        return response.data?.collections || response.data?.data || response.data || [];
      } catch (err) {
        console.error('Failed to fetch liked collections:', err);
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const collections: LikedCollection[] = Array.isArray(data) ? data : [];

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleUnlike = async (collectionId: string) => {
    try {
      await collectionsApi.unlike(collectionId);
      queryClient.invalidateQueries({ queryKey: ['liked-collections'] });
      setSnackbar({ visible: true, message: 'Koleksiyon beğenilerden çıkarıldı' });
    } catch (err) {
      console.error('Failed to unlike collection:', err);
      setSnackbar({ visible: true, message: 'Bir hata oluştu' });
    }
  };

  const getImageUrl = (collection: LikedCollection) => {
    if (collection.coverImageUrl) return collection.coverImageUrl;
    return 'https://via.placeholder.com/300x200?text=Koleksiyon';
  };

  return {
    isAuthenticated,
    collections,
    isLoading,
    error,
    refetch,
    refreshing,
    onRefresh,
    handleUnlike,
    getImageUrl,
    snackbar,
    setSnackbar,
  };
}

export type LikedCollectionsController = ReturnType<typeof useLikedCollections>;
