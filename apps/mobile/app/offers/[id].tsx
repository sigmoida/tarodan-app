import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Pressable } from 'react-native';
import { Button, Modal, Input, Text, theme } from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { offersApi } from '../../src/services/api';
import { ScreenHeader, ScreenLoader, ErrorState, ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { formatPrice, formatOfferStatus, formatRelativeDate } from '../../src/utils/format';
import { transformImageUrl } from '../../src/utils/imageUrl';
import { useAuthStore } from '../../src/stores/authStore';

const { colors } = theme;

interface Offer {
  id: string;
  productId: string;
  amount: number;
  message?: string;
  status: string;
  createdAt: string;
  expiresAt?: string;
  buyerId?: string;
  sellerId?: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url?: string; cardUrl?: string }> | string[];
    seller?: { id: string };
  };
  buyer?: { id: string; displayName: string };
  seller?: { id: string; displayName: string };
  counterAmount?: number;
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'accepted':
      return { bg: colors.success[50]!, fg: colors.success[600]! };
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return { bg: colors.danger[50]!, fg: colors.danger[600]! };
    case 'countered':
    case 'counter_offered':
      return { bg: colors.info[50]!, fg: colors.info[600]! };
    default:
      return { bg: colors.warning[50]!, fg: colors.warning[600]! };
  }
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [counterDialog, setCounterDialog] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  const {
    data: offer,
    isLoading,
    error,
    refetch,
  } = useQuery<Offer | null>({
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
      Alert.alert('Başarılı', 'Teklif kabul edildi. Sipariş oluşturuldu.');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Teklif kabul edilemedi.'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => offersApi.reject(id!),
    onSuccess: () => {
      invalidate();
      Alert.alert('Bilgi', 'Teklif reddedildi.');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem başarısız.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => offersApi.cancel(id!),
    onSuccess: () => {
      invalidate();
      Alert.alert('Bilgi', 'Teklif iptal edildi.');
      router.back();
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem başarısız.'),
  });

  const counterMutation = useMutation({
    mutationFn: (amount: number) => offersApi.counter(id!, amount),
    onSuccess: () => {
      invalidate();
      setCounterDialog(false);
      setCounterAmount('');
      Alert.alert('Başarılı', 'Karşı teklif gönderildi.');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'Karşı teklif gönderilemedi.'),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Teklif Detayı" />
        <ScreenLoader />
      </SafeAreaView>
    );
  }

  if (error || !offer) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Teklif Detayı" />
        <ErrorState fullscreen onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  const firstImg = Array.isArray(offer.product?.images) && offer.product!.images.length > 0
    ? (typeof offer.product!.images[0] === 'string'
      ? offer.product!.images[0] as string
      : (offer.product!.images[0] as any)?.cardUrl || (offer.product!.images[0] as any)?.url)
    : null;

  const isBuyer = user?.id === offer.buyer?.id || user?.id === offer.buyerId;
  const isSeller = user?.id === offer.seller?.id || user?.id === offer.sellerId || user?.id === offer.product?.seller?.id;
  const isPending = offer.status === 'pending';
  const color = statusColor(offer.status);
  const counterValue = parseFloat(counterAmount) || 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Teklif Detayı" />

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Product */}
        <Pressable
          style={({ pressed }) => [styles.productCard, pressed && { opacity: 0.85 }]}
          onPress={() => offer.product?.id && router.push(`/product/${offer.product.id}`)}
        >
          <Image source={{ uri: transformImageUrl(firstImg) }} style={styles.productImage} />
          <View style={styles.productBody}>
            <Text style={styles.productTitle} numberOfLines={2}>
              {offer.product?.title || 'Ürün'}
            </Text>
            {offer.product?.price ? (
              <Text style={styles.listPrice}>
                Liste fiyatı: {formatPrice(offer.product.price)}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {/* Status */}
        <View style={[styles.statusBanner, { backgroundColor: color.bg }]}>
          <Ionicons name="information-circle" size={18} color={color.fg} />
          <Text style={[styles.statusBannerText, { color: color.fg }]}>
            {formatOfferStatus(offer.status)}
          </Text>
        </View>

        {/* Amount */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Teklif Tutarı</Text>
          <Text style={styles.amountValue}>{formatPrice(offer.amount)}</Text>
          {offer.counterAmount ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.amountLabel}>Karşı Teklif</Text>
              <Text style={styles.counterValue}>{formatPrice(offer.counterAmount)}</Text>
            </>
          ) : null}
        </View>

        {/* Message */}
        {offer.message ? (
          <View style={styles.messageCard}>
            <Text style={styles.sectionTitle}>Mesaj</Text>
            <Text style={styles.messageText}>{offer.message}</Text>
          </View>
        ) : null}

        {/* Parties */}
        <View style={styles.partyCard}>
          <View style={styles.partyRow}>
            <Ionicons name="person-circle-outline" size={18} color={colors.text.muted} />
            <Text style={styles.partyLabel}>Alıcı:</Text>
            <Text style={styles.partyName}>{offer.buyer?.displayName || '—'}</Text>
          </View>
          <View style={styles.partyRow}>
            <Ionicons name="person-circle-outline" size={18} color={colors.text.muted} />
            <Text style={styles.partyLabel}>Satıcı:</Text>
            <Text style={styles.partyName}>{offer.seller?.displayName || '—'}</Text>
          </View>
          <View style={styles.partyRow}>
            <Ionicons name="time-outline" size={18} color={colors.text.muted} />
            <Text style={styles.partyLabel}>Oluşturuldu:</Text>
            <Text style={styles.partyName}>{formatRelativeDate(offer.createdAt)}</Text>
          </View>
        </View>

        {/* Actions */}
        {isPending && isSeller ? (
          <View style={styles.actionsStack}>
            <Button
              variant="success"
              onPress={() => acceptMutation.mutate()}
              isLoading={acceptMutation.isPending}
              disabled={acceptMutation.isPending || rejectMutation.isPending || counterMutation.isPending}
              icon="checkmark"
              fullWidth
              style={styles.actionBtn}
            >
              Kabul Et
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                setCounterAmount(offer.amount.toString());
                setCounterDialog(true);
              }}
              disabled={counterMutation.isPending}
              icon="swap-horizontal"
              fullWidth
              style={{ ...styles.actionBtn, borderColor: colors.info[600]! }}
              textStyle={{ color: colors.info[600]! }}
            >
              Karşı Teklif Ver
            </Button>
            <Button
              variant="outline"
              onPress={() =>
                Alert.alert('Reddet', 'Teklifi reddetmek istediğinize emin misiniz?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'Reddet', style: 'destructive', onPress: () => rejectMutation.mutate() },
                ])
              }
              disabled={rejectMutation.isPending}
              icon="close"
              fullWidth
              style={{ ...styles.actionBtn, borderColor: colors.danger[600]! }}
              textStyle={{ color: colors.danger[600]! }}
            >
              Reddet
            </Button>
          </View>
        ) : null}

        {isPending && isBuyer ? (
          <Button
            variant="outline"
            onPress={() =>
              Alert.alert('İptal Et', 'Teklifinizi iptal etmek istediğinize emin misiniz?', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
              ])
            }
            isLoading={cancelMutation.isPending}
            icon="trash-outline"
            fullWidth
            style={{ ...styles.actionBtn, borderColor: colors.danger[600]!, margin: 16 }}
            textStyle={{ color: colors.danger[600]! }}
          >
            Teklifi İptal Et
          </Button>
        ) : null}
      </ScrollView>

      <Modal isOpen={counterDialog} onClose={() => setCounterDialog(false)} title="Karşı Teklif">
        <Text style={{ marginBottom: 12, color: colors.text.muted }}>
          Karşı teklif tutarınızı girin.
        </Text>
        <Input
          label="Tutar (TL)"
          value={counterAmount}
          onChangeText={setCounterAmount}
          keyboardType="numeric"
        />
        <View style={styles.dialogActions}>
          <Button variant="ghost" onPress={() => setCounterDialog(false)}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              if (counterValue <= 0) {
                Alert.alert('Geçersiz tutar', 'Pozitif bir tutar girin.');
                return;
              }
              // API kuralı: karşı teklif mevcut tekliften yüksek, ürün fiyatından düşük/eşit olmalı.
              const refAmount = Number(offer.amount) || 0;
              const maxPrice = Number(offer.product?.price) || 0;
              if (counterValue <= refAmount) {
                Alert.alert('Hata', `Karşı teklif, mevcut tekliften (${formatPrice(refAmount)}) yüksek olmalıdır`);
                return;
              }
              if (maxPrice > 0 && counterValue > maxPrice) {
                Alert.alert('Hata', `Karşı teklif, ürün fiyatından (${formatPrice(maxPrice)}) yüksek olamaz`);
                return;
              }
              counterMutation.mutate(counterValue);
            }}
            isLoading={counterMutation.isPending}
            disabled={counterMutation.isPending || counterValue <= 0}
          >
            Gönder
          </Button>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  productCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.gray[50],
  },
  productBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.heading,
  },
  listPrice: {
    fontSize: 13,
    color: colors.text.muted,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  statusBannerText: {
    fontWeight: '700',
  },
  amountCard: {
    padding: 16,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  amountLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  amountValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary[700]!,
    marginTop: 4,
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.info[600]!,
    marginTop: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.DEFAULT,
    marginVertical: 10,
  },
  messageCard: {
    padding: 14,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: colors.text.heading,
    lineHeight: 20,
  },
  partyCard: {
    padding: 14,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
    gap: 8,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partyLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  partyName: {
    fontSize: 13,
    color: colors.text.heading,
    fontWeight: '600',
    flex: 1,
  },
  actionsStack: {
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    borderRadius: 10,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
