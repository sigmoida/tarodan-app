import { View, ScrollView, StyleSheet, Image, RefreshControl } from 'react-native';
import {
  Button,
  Card,
  Spinner,
  Text,
  StatusBadge,
  theme,
  ScreenHeader,
  appAlert,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { refundsApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { captureException } from '@/services/sentry';

const { colors } = theme;

const refundStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: 'Satıcı İncelemesinde', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'success' },
  wait_for_delivery: { label: 'İade Kargosu Bekleniyor', variant: 'info' },
  return_shipment_open: { label: 'İade Kargosu Açıldı', variant: 'info' },
  return_in_transit: { label: 'İade Kargoda', variant: 'primary' },
  return_delivered: { label: 'Satıcıya Ulaştı', variant: 'success' },
  refunded: { label: 'İade Edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
  disputed: { label: 'İncelemede (İtiraz)', variant: 'warning' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
};

const reasonLabels: Record<string, string> = {
  changed_mind: 'Vazgeçtim',
  damaged: 'Hasarlı geldi',
  wrong_item: 'Yanlış ürün',
  not_as_described: 'Açıklamayla uyuşmuyor',
  missing_parts: 'Eksik parça',
  other: 'Diğer',
};

// Süreç (metadata.history) aksiyon adlarının Türkçe karşılığı (refund.service appendHistory).
const actionLabels: Record<string, string> = {
  return_opened: 'İade kargosu açıldı',
  accepted_by_seller: 'Satıcı kabul etti',
  rejected_by_seller: 'Satıcı reddetti',
  cancelled_by_buyer: 'Alıcı iptal etti',
  refund_completed: 'Para iadesi tamamlandı',
  policy_overridden: 'Politika güncellendi',
  return_shipping_payer_changed: 'İade kargo ücreti güncellendi',
};

function formatPrice(value?: number): string {
  const n = Number(value ?? 0);
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function RefundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['refund-requests', 'detail', id],
    queryFn: async () => {
      const res: any = await refundsApi.getById(id as string);
      return (res?.data?.data ?? res?.data ?? res) as any;
    },
    enabled: isAuthenticated && !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['refund-requests'] });
  };

  const cancelMutation = useMutation({
    mutationFn: () => refundsApi.cancel(id as string),
    onSuccess: () => {
      appAlert('İptal edildi', 'İade talebiniz iptal edildi.');
      invalidate();
      refetch();
    },
    onError: (e: any) => {
      captureException(e, { level: 'error', tags: { flow: 'refund.detail.cancel' } });
      appAlert('Hata', e?.response?.data?.message || 'İşlem başarısız. Tekrar deneyin.');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="İade Detayı" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.loadingContainer}><Spinner size="lg" /></View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="İade Detayı" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>İade talebi bulunamadı</Text>
        </View>
      </View>
    );
  }

  const rr = data;
  const isRequester = !!user?.id && rr.requesterId === user.id;
  const canCancel = isRequester && rr.status === 'pending_review';
  const history: Array<{ action?: string; at?: string; by?: string }> =
    Array.isArray(rr?.metadata?.history) ? rr.metadata.history : [];
  const productTitle = rr.order?.product?.title ?? 'Ürün';
  const productImage = rr.order?.product?.images?.[0];

  return (
    <View style={styles.container}>
      <ScreenHeader title="İade Detayı" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />}
      >
        {/* Durum + sipariş no */}
        <Card variant="elevated" style={styles.card}>
          <View style={styles.cardHeader}>
            <Text variant="caption" style={styles.muted}>
              #{rr.refundNumber ?? rr.order?.orderNumber ?? String(rr.id).slice(0, 8)}
            </Text>
            <StatusBadge status={rr.status} config={refundStatusConfig} size="sm" />
          </View>
          <View style={styles.productRow}>
            {productImage ? (
              <Image source={{ uri: productImage }} style={styles.productImage} />
            ) : (
              <View style={[styles.productImage, styles.productImagePlaceholder]}>
                <Ionicons name="image-outline" size={22} color={colors.text.subtle} />
              </View>
            )}
            <View style={styles.productInfo}>
              <Text variant="label" numberOfLines={2}>{productTitle}</Text>
              <Text variant="h3" style={styles.amount}>{formatPrice(rr.amount)}</Text>
            </View>
          </View>
        </Card>

        {/* İade bilgileri */}
        <Card variant="elevated" style={styles.card}>
          <Text variant="label" style={styles.sectionTitle}>İade Bilgileri</Text>
          <Row label="Sebep" value={reasonLabels[rr.reason] ?? rr.reason} />
          {rr.description ? <Row label="Açıklama" value={rr.description} /> : null}
          {rr.order?.seller?.displayName ? <Row label="Satıcı" value={rr.order.seller.displayName} /> : null}
          {rr.requester?.displayName && !isRequester ? <Row label="Alıcı" value={rr.requester.displayName} /> : null}
          {rr.returnTrackingNumber ? <Row label="İade Takip No" value={rr.returnTrackingNumber} /> : null}
          {rr.createdAt ? <Row label="Talep Tarihi" value={formatDate(rr.createdAt)} /> : null}
        </Card>

        {/* Zaman çizelgesi */}
        {history.length > 0 ? (
          <Card variant="elevated" style={styles.card}>
            <Text variant="label" style={styles.sectionTitle}>Süreç</Text>
            {history.map((h, i) => (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption">{actionLabels[h.action ?? ''] ?? h.action ?? '—'}</Text>
                  <Text variant="caption" style={styles.muted}>{formatDate(h.at)}</Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {canCancel ? (
          <View style={styles.actions}>
            <Button
              variant="ghost"
              title="Talebi İptal Et"
              onPress={() =>
                appAlert('İade talebini iptal et', 'Bu iade talebini iptal etmek istediğinize emin misiniz?', [
                  { text: 'Vazgeç', style: 'cancel' },
                  { text: 'İptal Et', style: 'destructive', onPress: () => cancelMutation.mutate() },
                ])
              }
              isLoading={cancelMutation.isPending}
            />
          </View>
        ) : null}
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" style={styles.rowLabel}>{label}</Text>
      <Text variant="caption" style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { marginTop: 16 },
  card: { marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  muted: { color: colors.text.muted },
  productRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  productImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.surface.alt },
  productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, gap: 2 },
  amount: { marginTop: 2, color: colors.primary[600]! },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  rowLabel: { color: colors.text.muted },
  rowValue: { flex: 1, textAlign: 'right' },
  timelineRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[600]!, marginTop: 5 },
  actions: { marginTop: 4, marginBottom: 8 },
});
