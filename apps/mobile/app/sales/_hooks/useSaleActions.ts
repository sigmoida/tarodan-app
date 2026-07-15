import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { ordersApi, shippingApi } from '@/lib/api';
import type { Sale } from '../_lib/types';

/**
 * Seller sale-status controller — owns the prepare/ship mutation, the ship
 * dialog state + tracking-number input, and the two action handlers. Owns
 * appAlert + invalidateQueries (§6). Lifted verbatim from the monolithic screen.
 */
export function useSaleActions() {
  const queryClient = useQueryClient();
  const [shipDialog, setShipDialog] = useState<{ visible: boolean; order: Sale | null }>({
    visible: false,
    order: null,
  });
  const [trackingNumber, setTrackingNumber] = useState('');

  /**
   * Backend'de tek "status update" endpoint'i yok; iki ayrı akış:
   *   - "processing"  → POST /orders/:id/prepare         (markAsPreparing)
   *   - "shipped"     → POST /shipping  + PATCH /shipping/:id/tracking
   * Bu mutasyon hangi durumun istendiğine göre doğru endpoint'i çağırır.
   */
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      trackingNumber,
    }: {
      orderId: string;
      status: string;
      trackingNumber?: string;
    }) => {
      if (status === 'processing' || status === 'preparing') {
        return ordersApi.markAsPreparing(orderId);
      }
      if (status === 'shipped') {
        const created = await shippingApi.createShipment({ orderId, provider: 'surat' });
        const shipment = (created.data as any)?.data ?? (created.data as any);
        if (trackingNumber && shipment?.id) {
          await shippingApi.updateTracking(shipment.id, { trackingNumber });
        }
        return created;
      }
      throw new Error(`Desteklenmeyen sipariş durumu: ${status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShipDialog({ visible: false, order: null });
      setTrackingNumber('');
      appAlert('Başarılı', 'Sipariş durumu güncellendi');
    },
    onError: (e: any) => {
      appAlert('Hata', e?.response?.data?.message || e?.message || 'Durum güncellenemedi');
    },
  });

  const handleMarkAsProcessing = (order: Sale) => {
    appAlert(
      'Siparişi Hazırlıyor Olarak İşaretle',
      'Siparişi hazırlamaya başladığınızı onaylıyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: () => updateStatusMutation.mutate({ orderId: order.id, status: 'processing' }),
        },
      ],
    );
  };

  const handleShip = () => {
    if (!trackingNumber.trim()) {
      appAlert('Hata', 'Takip numarası giriniz');
      return;
    }
    if (shipDialog.order) {
      updateStatusMutation.mutate({
        orderId: shipDialog.order.id,
        status: 'shipped',
        trackingNumber: trackingNumber.trim(),
      });
    }
  };

  return {
    updateStatusMutation,
    shipDialog,
    setShipDialog,
    trackingNumber,
    setTrackingNumber,
    handleMarkAsProcessing,
    handleShip,
  };
}

export type SaleActionsController = ReturnType<typeof useSaleActions>;
