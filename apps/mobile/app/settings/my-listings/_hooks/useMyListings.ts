import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { theme, appAlert } from '@tarodan/ui-native';
import { productsApi } from '../../../../src/services/api';
import { useAuthStore } from '../../../../src/stores/authStore';
import { useTranslation } from '../../../../src/i18n';
import type { Listing, FilterType } from '../_lib/types';

const { colors } = theme;

/**
 * My-listings controller — owns the listings + stats queries, the deactivate/
 * reactivate/delete/relist mutations, focus refresh, filter/modal state, quota
 * derivation, and the action-menu dispatcher. Lifted verbatim from the monolith.
 */
export function useMyListings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, limits, refreshUserData } = useAuthStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [actionMenuListing, setActionMenuListing] = useState<Listing | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [boostListing, setBoostListing] = useState<Listing | null>(null);
  const isPremiumUser = Boolean(
    (user as any)?.isPremium ||
      ((user as any)?.membership_type && (user as any)?.membership_type !== 'free'),
  );

  const { data: listingsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-listings', filter],
    queryFn: async () => {
      const params: any = { limit: 100 };
      if (filter !== 'all') {
        params.status = filter;
      }
      const response = await productsApi.getMyListings(params);
      return response.data?.data || response.data || [];
    },
    retry: 1,
  });

  const listings: Listing[] = listingsData || [];

  // Chip sayaçları — AKTİF FİLTREDEN BAĞIMSIZ stabil kaynak (GET /products/my/stats).
  // Önceden sayaçlar o an çekili (filtrelenmiş + sayfalı) listeden hesaplanıyordu →
  // filtreye basınca değişiyor, çok ilanı olanda tavanlanıyordu. Artık tek sunucu agregatı.
  const { data: statsResp } = useQuery({
    queryKey: ['my-listings-stats'],
    queryFn: () => productsApi.getMyStats(),
    retry: 1,
  });
  const statCounts = (statsResp?.data as any)?.counts ?? {};
  // İlan kotası tek doğru kaynaktan: GET /products/my/stats summary.
  // used = aktif+beklemede+rezerve (satılan/pasif sayılmaz), max = maxTotalListings, canCreate = sunucu kararı.
  const quotaSummary = (statsResp?.data as any)?.summary;
  const counts = {
    all: statCounts.all ?? 0,
    active: statCounts.active ?? 0,
    pending: statCounts.pending ?? 0,
    sold: statCounts.sold ?? 0,
    reserved: statCounts.reserved ?? 0,
    rejected: statCounts.rejected ?? 0,
    inactive: statCounts.inactive ?? 0,
    deleted: statCounts.deleted ?? 0,
  };

  // Deactivate listing mutation - Web ile aynı: PATCH /products/:id
  const deactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'inactive' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan deaktif edildi');
    },
    onError: () => {
      appAlert('Hata', 'İlan deaktif edilemedi');
    },
  });

  // Reactivate listing mutation - Web ile aynı: PATCH /products/:id
  const reactivateMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'active' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan incelemeye gönderildi. Onaylandığında yeniden yayına girer.');
    },
    onError: () => {
      appAlert('Hata', 'İlan aktif edilemedi');
    },
  });

  // Delete listing mutation - Web ile aynı: DELETE /products/:id
  const deleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.delete(listingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      setDeleteDialogVisible(false);
      setSelectedListing(null);
      appAlert('Başarılı', 'İlan silindi');
    },
    onError: () => {
      appAlert('Hata', 'İlan silinemedi');
    },
  });

  // Relist expired listing - Web ile aynı: POST /products/:id/relist
  const relistMutation = useMutation({
    mutationFn: async (listingId: string) => {
      return productsApi.update(listingId, { status: 'active', relist: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      refreshUserData();
      appAlert('Başarılı', 'İlan incelemeye gönderildi. Onaylandığında yeniden yayına girer.');
    },
    onError: () => {
      appAlert('Hata', 'İlan yeniden yayınlanamadı. İlan limitinizi kontrol edin.');
    },
  });

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
      refreshUserData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['my-listings-stats'] });
    await refreshUserData();
    setRefreshing(false);
  };

  const filteredListings = listings.filter(listing => {
    if (filter === 'all') return true;
    return listing.status === filter;
  });

  const handleMenuAction = (action: string, listing: Listing) => {
    setActionMenuListing(null);

    switch (action) {
      case 'edit':
        router.push(`/listing/${listing.id}/edit`);
        break;
      case 'view':
        router.push(`/product/${listing.id}`);
        break;
      case 'deactivate':
        appAlert(
          'İlanı Deaktif Et',
          'Bu ilan pasif hale getirilecek. Devam etmek istiyor musunuz?',
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Deaktif Et', onPress: () => deactivateMutation.mutate(listing.id) },
          ]
        );
        break;
      case 'activate':
        reactivateMutation.mutate(listing.id);
        break;
      case 'boost':
        setBoostListing(listing);
        break;
      case 'relist':
        // Check listing limit before relisting — sunucu kotası (aktif sayım) baz alınır.
        if (quotaSummary?.canCreate === false) {
          appAlert(
            'İlan Limiti',
            'İlan limitinize ulaştınız. Yeniden yayınlamak için Premium üyeliğe geçin.',
            [
              { text: 'İptal', style: 'cancel' },
              { text: 'Premium\'a Geç', onPress: () => router.push('/upgrade') },
            ]
          );
          return;
        }
        relistMutation.mutate(listing.id);
        break;
      case 'delete':
        setSelectedListing(listing);
        setDeleteDialogVisible(true);
        break;
    }
  };

  const listingLimit = quotaSummary?.max ?? (limits?.maxListings || 10);
  const currentCount =
    quotaSummary?.used ??
    listings.filter((l) => l.status === 'active' || l.status === 'pending' || l.status === 'reserved').length;
  const canCreateNew = quotaSummary?.canCreate ?? (listingLimit === -1 || currentCount < listingLimit);

  const progressColor =
    listingLimit === -1
      ? colors.primary[600]!
      : currentCount >= listingLimit
        ? colors.danger[600]!
        : currentCount >= listingLimit - 2
          ? colors.warning[600]!
          : colors.primary[600]!;

  return {
    t,
    filter,
    setFilter,
    refreshing,
    onRefresh,
    isLoading,
    isError,
    refetch,
    filteredListings,
    counts,
    // modals / selection
    actionMenuListing,
    setActionMenuListing,
    deleteDialogVisible,
    setDeleteDialogVisible,
    selectedListing,
    boostListing,
    setBoostListing,
    isPremiumUser,
    // mutations + handlers
    deleteMutation,
    handleMenuAction,
    // quota
    listingLimit,
    currentCount,
    canCreateNew,
    progressColor,
  };
}

export type MyListingsController = ReturnType<typeof useMyListings>;
