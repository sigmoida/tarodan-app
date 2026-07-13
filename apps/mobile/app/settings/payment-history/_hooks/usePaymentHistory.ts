import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { appAlert } from '@tarodan/ui-native';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/services/api';
import type { Payment } from '../_lib/types';
import { STATUS_CONFIG, formatDate, formatCurrency } from '../_lib/status';

/**
 * Payment-history controller — owns the GET /payments/me fetch (mapped to the
 * screen model), focus refetch, refresh, and the detail alert. Lifted verbatim
 * from the monolithic screen (§12). NOTE: still useState+useEffect+api (RQ SONRAYA).
 */
export function usePaymentHistory() {
  const { isAuthenticated } = useAuthStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPayments = useCallback(
    async (showRefresh = false) => {
      if (!isAuthenticated) return;
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        // Web ile aynı kaynak: GET /payments/me. Yanıt alanları (orderNumber,
        // product, provider) ekran modeline (description, method) burada çevrilir.
        const res = await paymentsApi.getMyPayments({ limit: 50 });
        const raw: any = res.data;
        const items: any[] = raw?.payments || raw?.data || (Array.isArray(raw) ? raw : []);
        const data: Payment[] = items.map((p: any) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          status: p.status,
          method: p.method || (p.provider ? String(p.provider).toUpperCase() : ''),
          description:
            p.description || p.product?.title || (p.orderNumber ? `Sipariş #${p.orderNumber}` : 'Ödeme'),
          createdAt: p.createdAt,
          invoiceUrl: p.invoiceUrl,
          imageUrl: p.product?.images?.[0] || undefined,
        }));
        setPayments(data);
      } catch (err: any) {
        if (!showRefresh) {
          appAlert('Hata', 'Ödeme geçmişi yüklenirken bir hata oluştu.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useFocusEffect(
    useCallback(() => {
      fetchPayments();
    }, [fetchPayments]),
  );

  const handlePaymentPress = (payment: Payment) => {
    appAlert(
      'Ödeme Detayı',
      [
        `Tutar: ${formatCurrency(payment.amount)}`,
        `Tarih: ${formatDate(payment.createdAt)}`,
        `Durum: ${STATUS_CONFIG[payment.status]?.label || payment.status}`,
        `Yöntem: ${payment.method || '-'}`,
        payment.description ? `Açıklama: ${payment.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      [{ text: 'Tamam' }],
    );
  };

  return {
    isAuthenticated,
    payments,
    isLoading,
    isRefreshing,
    fetchPayments,
    handlePaymentPress,
  };
}

export type PaymentHistoryController = ReturnType<typeof usePaymentHistory>;
