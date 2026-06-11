import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import {
  Button,
  Card,
  Spinner,
  Modal,
  Input,
  Text,
  StatusBadge,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { refundsApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { captureException } from '../../src/services/sentry';

const { colors } = theme;

// Web ile parite — refund-requests/[id]/page.tsx statusConfig karşılığı
const refundStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_review: { label: 'İnceleme Bekliyor', variant: 'warning' },
  wait_for_delivery: { label: 'İade Kargosu Bekleniyor', variant: 'info' },
  accepted: { label: 'Kabul Edildi', variant: 'success' },
  in_transit: { label: 'İade Kargoda', variant: 'primary' },
  refunded: { label: 'İade Edildi', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
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

interface SellerRefund {
  id: string;
  status: string;
  reason: string;
  amount?: number;
  description?: string;
  createdAt?: string;
  order?: { orderNumber?: string; product?: { title?: string } };
  requester?: { displayName?: string };
}

function formatPrice(value?: number): string {
  const n = Number(value ?? 0);
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SellerRefundRequestsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{ visible: boolean; id: string | null }>({
    visible: false,
    id: null,
  });
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['refund-requests', 'seller'],
    queryFn: async () => {
      const res: any = await refundsApi.getSeller();
      const payload = res?.data?.data ?? res?.data ?? res;
      const list = Array.isArray(payload) ? payload : payload?.items ?? payload?.data ?? [];
      return list as SellerRefund[];
    },
    enabled: isAuthenticated,
  });

  const refunds = data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['refund-requests', 'seller'] });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => refundsApi.accept(id),
    onSuccess: () => {
      Alert.alert('Talep kabul edildi', 'İade talebi kabul edildi.');
      invalidate();
    },
    onError: (e: any) => {
      captureException(e, { level: 'error', tags: { flow: 'refund.seller.accept' } });
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem başarısız. Tekrar deneyin.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, response }: { id: string; response: string }) =>
      refundsApi.reject(id, response),
    onSuccess: () => {
      setRejectDialog({ visible: false, id: null });
      setRejectReason('');
      Alert.alert('Talep reddedildi', 'İade talebi reddedildi.');
      invalidate();
    },
    onError: (e: any) => {
      captureException(e, { level: 'error', tags: { flow: 'refund.seller.reject' } });
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem başarısız. Tekrar deneyin.');
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

  const submitReject = () => {
    if (!rejectDialog.id) return;
    if (rejectReason.trim().length < 10) {
      Alert.alert('Gerekçe gerekli', 'Red gerekçesi en az 10 karakter olmalıdır.');
      return;
    }
    rejectMutation.mutate({ id: rejectDialog.id, response: rejectReason.trim() });
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="receipt-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>İade Talepleri</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          İade taleplerini görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="İade Talepleri" onBack={() => router.back()} />

      {isLoading && refunds.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : refunds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-done-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>İade talebi yok</Text>
          <Text variant="body" tone="muted" style={styles.emptySubtitle}>
            Satışlarınıza gelen iade talepleri burada görünür
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {refunds.map((rr) => {
            const canDecide = rr.status === 'pending_review';
            return (
              <Card key={rr.id} variant="elevated" style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text variant="caption" style={styles.orderNumber}>
                    #{rr.order?.orderNumber ?? rr.id.slice(0, 8)}
                  </Text>
                  <StatusBadge status={rr.status} config={refundStatusConfig} size="sm" />
                </View>

                <View style={styles.cardBody}>
                  <Text variant="label" numberOfLines={1}>
                    {rr.order?.product?.title ?? 'Ürün'}
                  </Text>
                  <Text variant="caption" style={styles.muted}>
                    Sebep: {reasonLabels[rr.reason] ?? rr.reason}
                  </Text>
                  {rr.requester?.displayName ? (
                    <Text variant="caption" style={styles.muted}>
                      Alıcı: {rr.requester.displayName}
                    </Text>
                  ) : null}
                  {rr.description ? (
                    <Text variant="caption" style={styles.muted} numberOfLines={2}>
                      “{rr.description}”
                    </Text>
                  ) : null}
                  <Text variant="h3" style={styles.amount}>
                    {formatPrice(rr.amount)}
                  </Text>
                </View>

                {canDecide && (
                  <View style={styles.actions}>
                    <Button
                      variant="ghost"
                      title="Reddet"
                      onPress={() => setRejectDialog({ visible: true, id: rr.id })}
                      style={styles.actionBtn}
                    />
                    <Button
                      variant="primary"
                      title="Kabul Et"
                      onPress={() =>
                        Alert.alert(
                          'İade talebini kabul et',
                          'Bu iade talebini kabul etmek istediğinize emin misiniz?',
                          [
                            { text: 'Vazgeç', style: 'cancel' },
                            { text: 'Kabul Et', onPress: () => acceptMutation.mutate(rr.id) },
                          ],
                        )
                      }
                      isLoading={acceptMutation.isPending}
                      style={styles.actionBtn}
                    />
                  </View>
                )}
              </Card>
            );
          })}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Reject Dialog */}
      <Modal
        isOpen={rejectDialog.visible}
        onClose={() => setRejectDialog({ visible: false, id: null })}
        title="İade Talebini Reddet"
      >
        <Text variant="body" style={{ marginBottom: 12 }}>
          Reddetme gerekçenizi yazın (alıcıya iletilir).
        </Text>
        <Input
          label="Gerekçe"
          value={rejectReason}
          onChangeText={setRejectReason}
          placeholder="Örn: Ürün kullanılmış olarak iade edildi"
          multiline
        />
        <View style={styles.dialogActions}>
          <Button
            variant="ghost"
            title="Vazgeç"
            onPress={() => setRejectDialog({ visible: false, id: null })}
          />
          <Button
            variant="primary"
            title="Reddet"
            onPress={submitReject}
            isLoading={rejectMutation.isPending}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  title: { marginTop: 16, marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: { marginTop: 16, marginBottom: 8 },
  emptySubtitle: { textAlign: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  card: { marginBottom: 12 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: { color: colors.text.muted },
  cardBody: { gap: 4 },
  muted: { color: colors.text.muted },
  amount: { marginTop: 6, color: colors.primary[600]! },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  actionBtn: { flex: 1 },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
});
