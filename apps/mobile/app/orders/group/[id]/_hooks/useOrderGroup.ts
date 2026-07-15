import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { apiStatusToUi } from '@/utils/orderStatus';
import type { GroupDetail, GroupOrder } from '../_lib/types';

/**
 * Order-group controller — owns the group query (with the raw→UI status mapping)
 * and pull-to-refresh. Lifted verbatim from the monolithic screen (§12).
 */
export function useOrderGroup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: group, isLoading, refetch, error } = useQuery({
    queryKey: ['order-group', id],
    queryFn: async (): Promise<GroupDetail> => {
      const response = await ordersApi.getGroup(id!);
      const raw: any = response.data?.data ?? response.data;
      return {
        id: raw.id,
        groupNumber: raw.groupNumber,
        totalAmount: Number(raw.totalAmount ?? 0),
        status: raw.status === 'mixed' ? 'mixed' : apiStatusToUi(raw.status),
        createdAt: raw.createdAt,
        payment: raw.payment ?? null,
        orders: (raw.orders || []).map((o: any): GroupOrder => ({
          ...o,
          status: apiStatusToUi(o.status),
          totalAmount: Number(o.totalAmount ?? o.amount ?? 0),
          product: {
            ...(o.product || {}),
            id: o.product?.id ?? '',
            title: o.product?.title ?? '',
          },
        })),
      };
    },
    enabled: !!id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return { group, isLoading, error, refetch, refreshing, onRefresh };
}

export type OrderGroupController = ReturnType<typeof useOrderGroup>;
