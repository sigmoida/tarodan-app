import { Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import type { Order } from '../_lib/types';
import { statusColor } from '../_lib/status';

/**
 * Sale-detail controller — owns the order query, refresh, derived display state
 * (cancel-normalized status + colours, shipment tracking/provider) and the
 * call/track Linking handlers. Lifted verbatim from the monolithic screen (§12).
 */
export function useSaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: order, isLoading, error, refetch } = useQuery<Order | null>({
    queryKey: ['sale-order', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await ordersApi.getOne(id);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  // İptal'de status 'refunded' olsa bile "İptal Edildi" göster (alıcı ile tutarlı).
  const displayStatus = order?.cancellationType === 'iptal' ? 'cancelled' : order?.status ?? '';
  const sc = statusColor(displayStatus);
  const shipmentTracking = order?.shipment?.trackingNumber;
  const shipmentProvider = order?.shipment?.provider ?? order?.shipment?.carrier;
  const isSurat = (shipmentProvider ?? '').toLowerCase() === 'surat';

  const handleCall = () => {
    if (order?.buyer?.phone) {
      Linking.openURL(`tel:${order.buyer.phone}`);
    }
  };

  const handleTrack = () => {
    if (!shipmentTracking) return;
    Linking.openURL(
      `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(shipmentTracking)}`,
    );
  };

  return {
    order,
    isLoading,
    error,
    refetch,
    refreshing,
    onRefresh,
    displayStatus,
    sc,
    shipmentTracking,
    shipmentProvider,
    isSurat,
    handleCall,
    handleTrack,
  };
}

export type SaleDetailController = ReturnType<typeof useSaleDetail>;
