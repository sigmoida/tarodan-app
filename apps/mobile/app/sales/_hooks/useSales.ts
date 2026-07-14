import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { Sale, FilterType } from '../_lib/types';
import { saleBadgeStatus } from '../_lib/status';

/**
 * Sales list controller — owns the seller-orders query, the filter-independent
 * earnings aggregate, filter state, pull-to-refresh and focus refetch. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useSales() {
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['orders', 'seller', filter],
    queryFn: async () => {
      try {
        const params: any = { role: 'seller', limit: 100 };
        if (filter !== 'all') {
          // Mobil UI 'processing' adını kullanır; backend enum'u 'preparing'. Sınırda çevir.
          // 'cancelled' filtresi hem iptal (cancelled) hem para-iadesi (refunded) getirir.
          params.status =
            filter === 'processing' ? 'preparing'
            : filter === 'cancelled' ? 'cancelled,refunded'
            : filter;
        }
        const response = await ordersApi.getAll(params);
        const raw = (response.data as any)?.data || response.data || [];
        // Backend 'preparing' → mobil 'processing' (badge/aksiyon/filtre tek isimle çalışsın).
        return (Array.isArray(raw) ? raw : []).map((o: any) =>
          o?.status === 'preparing' ? { ...o, status: 'processing' } : o,
        );
      } catch (error) {
        console.log('Failed to fetch sales');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const sales: Sale[] = salesData || [];

  // Kazanç özeti — AKTİF FİLTREDEN BAĞIMSIZ sunucu agregatı. Önceden totalEarnings/
  // pendingEarnings filtrelenmiş + sayfalı `sales` listesinden hesaplanıyordu → 'paid'
  // filtresine basınca toplam kazanç 0'a düşüyordu. Artık tüm siparişler üzerinden tek sorgu.
  const { data: earningsResp } = useQuery({
    queryKey: ['orders', 'seller', 'earnings'],
    queryFn: () => ordersApi.getSellerEarnings(),
    enabled: isAuthenticated,
  });
  const totalEarnings = earningsResp?.data?.totalEarnings ?? 0;
  const pendingEarnings = earningsResp?.data?.pendingEarnings ?? 0;

  // Refresh on focus
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

  const filteredSales = sales.filter((sale) => {
    if (filter === 'all') return true;
    const ui = saleBadgeStatus(sale);
    if (filter === 'cancelled') return ui === 'cancelled' || ui === 'refunded';
    return ui === filter;
  });

  return {
    isAuthenticated,
    filter,
    setFilter,
    sales,
    filteredSales,
    isLoading,
    refetch,
    refreshing,
    onRefresh,
    totalEarnings,
    pendingEarnings,
  };
}

export type SalesController = ReturnType<typeof useSales>;
