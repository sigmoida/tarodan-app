import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { apiStatusToUi, uiFilterToApiStatusParam } from '@/utils/orderStatus';
import {
  normalizeOrder,
  type Order,
  type OrderListEntry,
  type FilterType,
} from '../_lib/ordersStatus';

/**
 * Orders (buyer) controller — owns the grouped/flat orders query, focus
 * refresh, filter + accordion + rating-modal + snackbar state. Lifted verbatim
 * from the monolithic OrdersScreen.
 */
export function useOrders() {
  const { isAuthenticated } = useAuthStore();
  // Bu ekran alıcı-only (Siparişlerim). Satıcı satışları /sales'te.
  const role: 'buyer' | 'seller' = 'buyer';
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  // Çok ürünlü grup accordion durumu — varsayılan KAPALI (boş Set)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
    order: Order | null;
  }>({ visible: false, type: 'product', order: null });
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant: 'success' | 'danger' | 'default' }>({
    visible: false,
    message: '',
    variant: 'default',
  });

  // Fetch orders.
  // Alıcı + "Tümü": gruplu liste (tek checkout = tek kart, çok ürün destekli).
  // Diğer filtreler ve satıcı sekmesi: düz sipariş listesi (durum filtreli).
  const useGroupedList = role === 'buyer' && filter === 'all';
  const { data: ordersData, isLoading, refetch, error: ordersError } = useQuery({
    queryKey: ['orders', role, filter],
    queryFn: async (): Promise<OrderListEntry[]> => {
      if (useGroupedList) {
        const response = await ordersApi.getGroups({ limit: 50, page: 1 });
        const raw = response.data?.data ?? response.data;
        const list = Array.isArray(raw) ? raw : [];
        return list.map((rawGroup: any): OrderListEntry => {
          const groupOrders: Order[] = (rawGroup.orders || []).map(normalizeOrder);
          // Tek ürünlü grup → klasik sipariş kartı (mevcut UX korunur)
          if (groupOrders.length === 1) {
            return { kind: 'order', order: groupOrders[0] };
          }
          return {
            kind: 'group',
            group: {
              id: rawGroup.id,
              groupNumber: rawGroup.groupNumber,
              totalAmount: Number(rawGroup.totalAmount ?? 0),
              status:
                rawGroup.status === 'mixed' ? 'mixed' : apiStatusToUi(rawGroup.status),
              createdAt: rawGroup.createdAt,
              orders: groupOrders,
            },
          };
        });
      }

      const params: Record<string, string | number> = { role, limit: 100, page: 1 };
      if (filter === 'refunds') {
        // "İadeler" sekmesi: iade talebi olan tüm siparişler (status'tan bağımsız;
        // iade tamamlanınca sipariş cancelled olduğu için status filtresiyle gelmez).
        params.refundsOnly = 'true';
      } else {
        const apiStatus = uiFilterToApiStatusParam(filter);
        if (apiStatus) params.status = apiStatus;
      }

      const response = await ordersApi.getAll(params);
      const raw = response.data?.data ?? response.data;
      const list = Array.isArray(raw) ? raw : [];

      let normalized: Order[] = list.map(normalizeOrder);
      if (filter === 'processing') {
        normalized = normalized.filter((o) => o.status === 'processing');
      }
      return normalized.map((order): OrderListEntry => ({ kind: 'order', order }));
    },
    enabled: isAuthenticated,
  });

  const entries: OrderListEntry[] = ordersData || [];

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return {
    isAuthenticated,
    filter,
    setFilter,
    refreshing,
    onRefresh,
    expandedGroups,
    toggleGroup,
    ratingModal,
    setRatingModal,
    snackbar,
    setSnackbar,
    entries,
    isLoading,
    ordersError,
    refetch,
  };
}

export type OrdersController = ReturnType<typeof useOrders>;
