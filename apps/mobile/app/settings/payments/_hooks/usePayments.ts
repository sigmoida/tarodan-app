import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/lib/api';
import type { Payment } from '../_lib/types';

/**
 * Payments-history controller — owns the GET /payments/me query + status filter,
 * the cancel (pending) and retry (failed → paymentUrl webview) handlers, and the
 * snackbar. Lifted verbatim from the monolithic screen (§12).
 */
export function usePayments() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const paymentsQuery = useQuery({
    queryKey: ['my-payments', statusFilter],
    queryFn: async () => {
      const params: any = { page: 1, limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const response = await paymentsApi.getMyPayments(params);
      const data: any = response.data;
      const list: Payment[] = data?.payments ?? data?.data ?? data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: isAuthenticated,
  });

  const handleCancel = (id: string) => {
    appAlert('Ödemeyi İptal Et', 'Bu bekleyen ödemeyi iptal etmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal Et',
        style: 'destructive',
        onPress: async () => {
          try {
            await paymentsApi.cancel(id);
            setSnackbar({ visible: true, message: 'Ödeme iptal edildi' });
            queryClient.invalidateQueries({ queryKey: ['my-payments'] });
          } catch (e: any) {
            appAlert('Hata', e?.response?.data?.message || 'Ödeme iptal edilemedi.');
          }
        },
      },
    ]);
  };

  const handleRetry = (id: string) => {
    appAlert('Ödemeyi Yeniden Dene', 'Bu ödeme için tekrar deneme yapılacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Devam',
        onPress: async () => {
          try {
            const response: any = await paymentsApi.retry(id);
            const url = response?.data?.paymentUrl ?? response?.data?.data?.paymentUrl;
            if (url) {
              router.push({ pathname: '/payment/[id]', params: { id, paymentUrl: url } } as any);
            } else {
              setSnackbar({ visible: true, message: 'Yeniden deneme başlatıldı' });
              queryClient.invalidateQueries({ queryKey: ['my-payments'] });
            }
          } catch (e: any) {
            appAlert('Hata', e?.response?.data?.message || 'Yeniden denenemedi.');
          }
        },
      },
    ]);
  };

  return {
    isAuthenticated,
    paymentsQuery,
    payments: paymentsQuery.data ?? [],
    statusFilter,
    setStatusFilter,
    snackbar,
    setSnackbar,
    handleCancel,
    handleRetry,
  };
}

export type PaymentsController = ReturnType<typeof usePayments>;
