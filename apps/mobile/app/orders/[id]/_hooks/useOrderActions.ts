import { useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { ordersApi, refundsApi, mediaApi, paymentsApi, type RNFile } from '@/lib/api';
import { qk } from '@/lib/query';
import { captureException } from '@/services/sentry';
import { MAX_EVIDENCE_PHOTOS } from '../_lib/status';
import type { OrderDetail } from '../_lib/types';

type SnackVariant = 'success' | 'danger' | 'default';

// Ödeme akışının (initiate) hata formu: array ise join'le, sonra string değilse fallback.
const joinMsg = (err: any, fallback: string): string => {
  const raw = err?.response?.data?.message;
  const msg = Array.isArray(raw) ? raw.join(', ') : raw || fallback;
  return typeof msg === 'string' ? msg : fallback;
};

// refund/cancelRefund/cancelOrder'ın ORİJİNAL hata formu: string mesajı göster,
// array/eksik mesajda genel fallback göster (parite — array'i join'leME).
const strMsg = (err: any, fallback: string): string => {
  const msg = err?.response?.data?.message || fallback;
  return typeof msg === 'string' ? msg : fallback;
};

/**
 * Sipariş detay controller'ı: iade/iade-iptal/sipariş-iptal/ödeme-başlat mutation'ları
 * + iade modalının form durumu (sebep/açıklama/adet/kanıt foto) + snackbar.
 */
export function useOrderActions(id: string, order: OrderDetail | undefined) {
  const queryClient = useQueryClient();

  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant: SnackVariant }>({
    visible: false,
    message: '',
    variant: 'default',
  });
  const notify = (message: string, variant: SnackVariant = 'default') =>
    setSnackbar({ visible: true, message, variant });
  const dismissSnackbar = () => setSnackbar({ visible: false, message: '', variant: 'default' });

  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [refundReason, setRefundReason] = useState('changed_mind');
  const [refundDescription, setRefundDescription] = useState('');
  const [evidenceAssets, setEvidenceAssets] = useState<RNFile[]>([]);
  const [refundQuantity, setRefundQuantity] = useState(1);

  const invalidateOrder = () => {
    queryClient.invalidateQueries({ queryKey: qk.orders.detail(id) });
    queryClient.invalidateQueries({ queryKey: qk.orders.all });
  };

  const closeRefundModal = () => {
    setRefundModalVisible(false);
    setEvidenceAssets([]);
    setRefundQuantity(1);
  };

  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: { reason: string; description?: string; evidencePhotoUrls?: string[]; refundQuantity?: number } = {
        reason: refundReason,
      };
      const desc = refundDescription.trim();
      if (desc.length > 0) body.description = desc;
      const orderQty = order?.quantity ?? 1;
      if (orderQty > 1 && refundQuantity < orderQty) body.refundQuantity = refundQuantity;
      if (evidenceAssets.length > 0) {
        const results = await Promise.all(evidenceAssets.map((file) => mediaApi.uploadRefundEvidence(file)));
        const urls = results.map((r) => r.data?.url).filter(Boolean) as string[];
        if (urls.length > 0) body.evidencePhotoUrls = urls;
      }
      return refundsApi.create(id, body);
    },
    onSuccess: () => {
      setRefundModalVisible(false);
      setRefundDescription('');
      setEvidenceAssets([]);
      setRefundQuantity(1);
      notify('İade talebiniz oluşturuldu.', 'success');
      invalidateOrder();
    },
    onError: (err: any) => {
      captureException(err, { level: 'error', tags: { flow: 'refund.create' }, extra: { orderId: id, reason: refundReason } });
      notify(strMsg(err, 'İade talebi oluşturulamadı.'), 'danger');
    },
  });

  const cancelRefundMutation = useMutation({
    mutationFn: (refundId: string) => refundsApi.cancel(refundId),
    onSuccess: () => {
      invalidateOrder();
      notify('İade talebi iptal edildi.', 'success');
    },
    onError: (err: any) => {
      captureException(err, { level: 'error', tags: { flow: 'refund.cancel' }, extra: { orderId: id } });
      notify(strMsg(err, 'İptal başarısız.'), 'danger');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: () => ordersApi.cancel(id),
    onSuccess: () => {
      invalidateOrder();
      notify('Siparişiniz iptal edildi.', 'success');
    },
    onError: (err: any) => {
      captureException(err, { level: 'error', tags: { flow: 'order.cancel' }, extra: { orderId: id } });
      notify(strMsg(err, 'Sipariş iptal edilemedi.'), 'danger');
    },
  });

  const initiatePaymentMutation = useMutation({
    mutationFn: async () => {
      const res: any = await paymentsApi.initiate(id);
      return res.data?.data ?? res.data ?? {};
    },
    onSuccess: (data: any) => {
      const paymentId = data?.paymentId || data?.id || data?.payment?.id || id;
      if (data?.useBypass === true) {
        paymentsApi.bypassComplete(paymentId).catch((e: any) =>
          captureException(e, { level: 'error', tags: { flow: 'order.payBypass' }, extra: { paymentId, orderId: id } }),
        );
        router.replace({ pathname: '/payment/success', params: { paymentId, orderId: id } } as any);
        return;
      }
      router.push({
        pathname: '/payment/[id]',
        params: { id: paymentId, orderId: id, provider: 'paytr', guest: '0' },
      } as any);
    },
    onError: (err: any) => {
      captureException(err, { level: 'error', tags: { flow: 'order.payInitiate' }, extra: { orderId: id } });
      notify(joinMsg(err, 'Ödeme başlatılamadı. Lütfen tekrar deneyin.'), 'danger');
    },
  });

  // --- Kanıt fotoğrafı ---
  const pickEvidence = async () => {
    const remaining = MAX_EVIDENCE_PHOTOS - evidenceAssets.length;
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('İzin Gerekli', 'Fotoğraf eklemek için galeri erişim izni gerekiyor.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const picked: RNFile[] = result.assets.slice(0, remaining).map((a, i) => ({
      uri: Platform.OS === 'android' ? a.uri : a.uri.replace('file://', ''),
      name: a.fileName || `evidence_${i}.jpg`,
      type: a.mimeType || 'image/jpeg',
    }));
    setEvidenceAssets((prev) => [...prev, ...picked]);
  };
  const removeEvidence = (index: number) => setEvidenceAssets((prev) => prev.filter((_, i) => i !== index));

  // --- Handler'lar ---
  const handleCancelRefund = () => {
    const rr = order?.activeRefundRequest;
    if (!rr) return;
    appAlert('İade Talebini İptal Et', 'İade talebiniz iptal edilecek. Devam edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'İptal Et', style: 'destructive', onPress: () => cancelRefundMutation.mutate(rr.id) },
    ]);
  };

  const handleCancelOrder = () => {
    const isUnpaid = order?.status === 'pending';
    appAlert(
      'Siparişi İptal Et',
      isUnpaid
        ? 'Sipariş iptal edilecek. Devam edilsin mi?'
        : 'Sipariş iptal edilecek ve ödemeniz iade edilecek. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => cancelOrderMutation.mutate() },
      ],
    );
  };

  return {
    snackbar,
    notify,
    dismissSnackbar,
    invalidateOrder,
    // iade modalı
    refund: {
      visible: refundModalVisible,
      open: () => setRefundModalVisible(true),
      close: closeRefundModal,
      reason: refundReason,
      setReason: setRefundReason,
      description: refundDescription,
      setDescription: setRefundDescription,
      quantity: refundQuantity,
      setQuantity: setRefundQuantity,
      evidence: evidenceAssets,
      pickEvidence,
      removeEvidence,
      submit: () => refundMutation.mutate(),
      isPending: refundMutation.isPending,
    },
    handleCancelRefund,
    cancelRefundPending: cancelRefundMutation.isPending,
    handleCancelOrder,
    cancelOrderPending: cancelOrderMutation.isPending,
    initiatePayment: () => initiatePaymentMutation.mutate(),
    payPending: initiatePaymentMutation.isPending,
  };
}
