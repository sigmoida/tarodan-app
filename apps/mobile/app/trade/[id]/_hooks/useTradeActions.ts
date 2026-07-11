import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { tradesApi, paymentsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useTranslation } from '@/i18n';
import { captureException } from '@/services/sentry';

type DisputeReason = 'shipment_lost' | 'shipment_damaged' | 'wrong_item' | 'other';

/**
 * Takas detay controller'ı: 6 mutation (kabul/reddet/onayla/nakit-öde/iptal/itiraz)
 * + snackbar + iki modalın (reddet/itiraz) UI durumu + teslimat adresi. Tüm iş
 * mantığı ekrandan buraya taşındı; index yalnız kompozisyon yapar.
 */
export function useTradeActions(id: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const notify = (message: string) => setSnackbar({ visible: true, message });
  const dismissSnackbar = () => setSnackbar((s) => ({ ...s, visible: false }));

  const [tradeAddressId, setTradeAddressId] = useState<string | null>(null);

  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [disputeVisible, setDisputeVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('shipment_lost');
  const [disputeDescription, setDisputeDescription] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.trades.detail(id) });
    queryClient.invalidateQueries({ queryKey: qk.trades.all });
  };

  const acceptMutation = useMutation({
    mutationFn: () => tradesApi.accept(id, undefined, tradeAddressId ?? undefined),
    onSuccess: () => {
      invalidate();
      notify('Takas kabul edildi!');
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'trade.accept' }, extra: { tradeId: id } });
      notify(error.response?.data?.message || 'İşlem başarısız');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => tradesApi.reject(id, rejectReason.trim() || undefined),
    onSuccess: () => {
      invalidate();
      setRejectVisible(false);
      setRejectReason('');
      notify('Takas reddedildi');
    },
    onError: (error: any) => notify(error.response?.data?.message || 'İşlem başarısız'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => tradesApi.confirmReceipt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.trades.detail(id) });
      notify('Takas tamamlandı!');
    },
    onError: (error: any) => notify(error.response?.data?.message || 'İşlem başarısız'),
  });

  const cashPayMutation = useMutation({
    mutationFn: () => paymentsApi.initiateTradeCash(id),
    onSuccess: (response: any) => {
      const data = response?.data?.data ?? response?.data ?? {};
      const paymentId = data.paymentId ?? data.id;
      if (!paymentId) {
        notify('Ödeme başlatılamadı (paymentId eksik).');
        return;
      }
      const paymentUrl: string | undefined = data.paymentUrl;
      router.push({
        pathname: '/payment/[id]',
        params: {
          id: paymentId,
          provider: 'paytr',
          tradeCash: '1',
          tradeId: String(id),
          ...(paymentUrl ? { paymentUrl } : {}),
        },
      } as any);
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'trade.cashPay' }, extra: { tradeId: id } });
      notify(error?.response?.data?.message || 'Ödeme başlatılamadı');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => tradesApi.cancel(id, 'Kullanıcı tarafından iptal edildi'),
    onSuccess: () => {
      invalidate();
      notify('Takas iptal edildi');
    },
    onError: (error: any) => notify(error.response?.data?.message || 'İşlem başarısız'),
  });

  const disputeMutation = useMutation({
    mutationFn: () =>
      tradesApi.raiseDispute(id, { reason: disputeReason, description: disputeDescription.trim() }),
    onSuccess: () => {
      invalidate();
      setDisputeVisible(false);
      setDisputeDescription('');
      notify(t('trade.dispute.successMessage'));
    },
    onError: (error: any) => notify(error.response?.data?.message || t('trade.dispute.errorMessage')),
  });

  // --- Handler'lar (aksiyon butonlarından) ---
  const handleAccept = () => {
    if (!tradeAddressId) {
      appAlert('Teslimat Adresi', 'Lütfen bir teslimat adresi seçin veya ekleyin.');
      return;
    }
    appAlert('Takası Kabul Et', 'Bu takas teklifini kabul etmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kabul Et', onPress: () => acceptMutation.mutate() },
    ]);
  };

  const handleCancel = () => {
    appAlert('Takası İptal Et', 'Bu takas teklifini iptal etmek istediğinize emin misiniz?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
    ]);
  };

  const submitDispute = () => {
    if (disputeDescription.trim().length < 10) {
      notify(t('trade.dispute.minLengthError'));
      return;
    }
    disputeMutation.mutate();
  };

  return {
    snackbar,
    notify,
    dismissSnackbar,
    // teslimat adresi
    setTradeAddressId,
    // reddet modal
    reject: {
      visible: rejectVisible,
      open: () => setRejectVisible(true),
      close: () => setRejectVisible(false),
      reason: rejectReason,
      setReason: setRejectReason,
      submit: () => rejectMutation.mutate(),
      isPending: rejectMutation.isPending,
    },
    // itiraz modal
    dispute: {
      visible: disputeVisible,
      open: () => setDisputeVisible(true),
      close: () => setDisputeVisible(false),
      reason: disputeReason,
      setReason: setDisputeReason,
      description: disputeDescription,
      setDescription: setDisputeDescription,
      submit: submitDispute,
      isPending: disputeMutation.isPending,
    },
    // aksiyonlar
    handleAccept,
    handleCancel,
    acceptPending: acceptMutation.isPending,
    cancelPending: cancelMutation.isPending,
    confirm: () => confirmMutation.mutate(),
    confirmPending: confirmMutation.isPending,
    cashPay: () => cashPayMutation.mutate(),
    cashPayPending: cashPayMutation.isPending,
    rejectPending: rejectMutation.isPending,
  };
}
