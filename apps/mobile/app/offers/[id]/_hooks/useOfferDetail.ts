import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appAlert } from '@tarodan/ui-native';
import { offersApi } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import { formatPrice } from '@/utils/format';
import { useAuthStore } from '@/stores/authStore';
import type { Offer } from '../_lib/types';
import { statusColor } from '../_lib/status';

/**
 * Offer-detail controller — owns the offer query, the accept/reject/cancel/
 * counter mutations (each owns appAlert + invalidate), the counter dialog state,
 * pull-to-refresh and derived flags. Lifted verbatim from the monolithic
 * orphan screen (§12); route-local (not merged into the list's offers/_lib).
 */
export function useOfferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [counterDialog, setCounterDialog] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  const { data: offer, isLoading, error, refetch } = useQuery<Offer | null>({
    queryKey: ['offer', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await offersApi.getOne(id);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['offer', id] });
    queryClient.invalidateQueries({ queryKey: ['offers'] });
  };

  const acceptMutation = useMutation({
    mutationFn: () => offersApi.accept(id!),
    onSuccess: () => {
      invalidate();
      appAlert('Başarılı', 'Teklif kabul edildi. Sipariş oluşturuldu.');
    },
    onError: (e: any) => appAlert('Hata', e?.response?.data?.message || 'Teklif kabul edilemedi.'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => offersApi.reject(id!),
    onSuccess: () => {
      invalidate();
      appAlert('Bilgi', 'Teklif reddedildi.');
    },
    onError: (e: any) => appAlert('Hata', e?.response?.data?.message || 'İşlem başarısız.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => offersApi.cancel(id!),
    onSuccess: () => {
      invalidate();
      appAlert('Bilgi', 'Teklif iptal edildi.');
      router.canGoBack() ? router.back() : router.replace('/(tabs)');
    },
    onError: (e: any) => appAlert('Hata', e?.response?.data?.message || 'İşlem başarısız.'),
  });

  const counterMutation = useMutation({
    mutationFn: (amount: number) => offersApi.counter(id!, amount),
    onSuccess: () => {
      invalidate();
      setCounterDialog(false);
      setCounterAmount('');
      appAlert('Başarılı', 'Karşı teklif gönderildi.');
    },
    onError: (e: any) => appAlert('Hata', e?.response?.data?.message || 'Karşı teklif gönderilemedi.'),
  });

  const firstImg =
    Array.isArray(offer?.product?.images) && offer!.product!.images.length > 0
      ? typeof offer!.product!.images[0] === 'string'
        ? (offer!.product!.images[0] as string)
        : (offer!.product!.images[0] as any)?.cardUrl || (offer!.product!.images[0] as any)?.url
      : null;

  const isBuyer = !!offer && (user?.id === offer.buyer?.id || user?.id === offer.buyerId);
  const isSeller =
    !!offer &&
    (user?.id === offer.seller?.id ||
      user?.id === offer.sellerId ||
      user?.id === offer.product?.seller?.id);
  const isPending = offer?.status === 'pending';
  const color = offer ? statusColor(offer.status) : null;
  const counterValue = parseFloat(counterAmount) || 0;

  const openCounter = () => {
    if (offer) setCounterAmount(offer.amount.toString());
    setCounterDialog(true);
  };

  const submitCounter = () => {
    if (!offer) return;
    if (counterValue <= 0) {
      appAlert('Geçersiz tutar', 'Pozitif bir tutar girin.');
      return;
    }
    // API kuralı: karşı teklif mevcut tekliften yüksek, ürün fiyatından düşük/eşit olmalı.
    const refAmount = Number(offer.amount) || 0;
    const maxPrice = Number(offer.product?.price) || 0;
    if (counterValue <= refAmount) {
      appAlert('Hata', `Karşı teklif, mevcut tekliften (${formatPrice(refAmount)}) yüksek olmalıdır`);
      return;
    }
    if (maxPrice > 0 && counterValue > maxPrice) {
      appAlert('Hata', `Karşı teklif, ürün fiyatından (${formatPrice(maxPrice)}) yüksek olamaz`);
      return;
    }
    counterMutation.mutate(counterValue);
  };

  return {
    offer,
    isLoading,
    error,
    refetch,
    refreshing,
    onRefresh,
    acceptMutation,
    rejectMutation,
    cancelMutation,
    counterMutation,
    counterDialog,
    setCounterDialog,
    counterAmount,
    setCounterAmount,
    counterValue,
    firstImg,
    isBuyer,
    isSeller,
    isPending,
    color,
    openCounter,
    submitCounter,
  };
}

export type OfferDetailController = ReturnType<typeof useOfferDetail>;
