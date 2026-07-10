import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Card, Chip, Snackbar, Spinner, Text, theme, appAlert } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader, EmptyState } from '@/components/common';
import { useAuthStore } from '@/stores/authStore';
import { paymentsApi } from '@/services/api';
import { formatPrice } from '@/utils/format';

const { colors } = theme;

/**
 * Ödeme geçmişi.
 * Web `apps/web/src/app/profile/payments/page.tsx` paritesi.
 *  - GET /payments/me ile listeleme + status/provider filtresi
 *  - pending → cancel butonu
 *  - failed → retry butonu (paymentUrl dönerse webview'e açar)
 */

interface Payment {
  id: string;
  orderId: string;
  orderNumber?: string;
  amount: number;
  currency?: string;
  provider: string;
  status: string;
  failureReason?: string;
  product?: { id: string; title: string };
  createdAt: string;
  paidAt?: string;
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'completed', label: 'Başarılı' },
  { value: 'failed', label: 'Başarısız' },
  { value: 'cancelled', label: 'İptal' },
];

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string; icon: any }> = {
  completed: { bg: colors.success[50]!, fg: colors.success[600]!, label: 'Tamamlandı', icon: 'checkmark-circle' },
  pending: { bg: colors.warning[50]!, fg: colors.warning[600]!, label: 'Bekliyor', icon: 'time-outline' },
  failed: { bg: colors.danger[50]!, fg: colors.danger[600]!, label: 'Başarısız', icon: 'close-circle' },
  cancelled: { bg: colors.gray[100], fg: colors.text.muted, label: 'İptal', icon: 'ban-outline' },
};

export default function PaymentsScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>(
    { visible: false, message: '' },
  );

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
    appAlert(
      'Ödemeyi İptal Et',
      'Bu bekleyen ödemeyi iptal etmek istediğinize emin misiniz?',
      [
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
      ],
    );
  };

  const handleRetry = (id: string) => {
    appAlert(
      'Ödemeyi Yeniden Dene',
      'Bu ödeme için tekrar deneme yapılacak.',
      [
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
      ],
    );
  };

  const formatDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ödemelerim" />
        <EmptyState
          icon="lock-closed-outline"
          title="Giriş Gerekli"
          subtitle="Ödeme geçmişinizi görmek için giriş yapın."
          actionLabel="Giriş Yap"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </View>
    );
  }

  const payments = paymentsQuery.data ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ödemelerim" />

      {/* Status filtresi */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.value || 'all'}
            label={opt.label}
            variant="primary"
            selected={statusFilter === opt.value}
            onPress={() => setStatusFilter(opt.value)}
            style={styles.filterChip}
          />
        ))}
      </ScrollView>

      {paymentsQuery.isLoading ? (
        <View style={styles.loading}>
          <Spinner size="lg" />
        </View>
      ) : payments.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title="Henüz ödeme yok"
          subtitle={statusFilter ? 'Bu filtreyle eşleşen ödeme bulunamadı.' : 'Yaptığınız ödemeler burada listelenecek.'}
        />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={paymentsQuery.isFetching}
              onRefresh={() => paymentsQuery.refetch()}
              colors={[colors.primary[600]!]}
            />
          }
        >
          {payments.map((p) => {
            const status = STATUS_COLORS[p.status] ?? STATUS_COLORS.pending;
            return (
              <Card key={p.id} style={styles.paymentCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNumber}>
                      {p.orderNumber ? `#${p.orderNumber}` : `Sipariş #${p.orderId.slice(0, 8)}`}
                    </Text>
                    {p.product?.title ? (
                      <Text style={styles.productTitle} numberOfLines={2}>
                        {p.product.title}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.amount}>{formatPrice(p.amount)}</Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                    <Ionicons name={status.icon} size={13} color={status.fg} />
                    <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
                  </View>
                  <View style={styles.providerWrap}>
                    <Ionicons name="card-outline" size={13} color={colors.text.muted} />
                    <Text style={styles.providerText}>{p.provider?.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.dateText}>{formatDate(p.paidAt || p.createdAt)}</Text>

                {p.failureReason ? (
                  <View style={styles.failureBox}>
                    <Ionicons name="alert-circle" size={14} color={colors.danger[600]!} />
                    <Text style={styles.failureText}>{p.failureReason}</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  {p.status === 'pending' && (
                    <Pressable
                      onPress={() => handleCancel(p.id)}
                      style={[styles.actionButton, styles.cancelButton]}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={colors.danger[600]!} />
                      <Text style={[styles.actionLabel, { color: colors.danger[600]! }]}>İptal</Text>
                    </Pressable>
                  )}
                  {p.status === 'failed' && (
                    <Pressable
                      onPress={() => handleRetry(p.id)}
                      style={[styles.actionButton, styles.retryButton]}
                    >
                      <Ionicons name="refresh" size={16} color={colors.primary[600]!} />
                      <Text style={[styles.actionLabel, { color: colors.primary[600]! }]}>Yeniden Dene</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => router.push({ pathname: '/orders/[id]', params: { id: p.orderId } } as any)}
                    style={[styles.actionButton, styles.viewButton]}
                  >
                    <Ionicons name="receipt-outline" size={16} color={colors.text.muted} />
                    <Text style={[styles.actionLabel, { color: colors.text.muted }]}>Sipariş</Text>
                  </Pressable>
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        variant="success"
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  filterScroll: {
    backgroundColor: colors.surface.DEFAULT,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    // Chip variant handles bg/fg states
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  paymentCard: {
    backgroundColor: colors.surface.DEFAULT,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.heading,
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  providerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  providerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: colors.text.subtle,
    marginBottom: 8,
  },
  failureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.danger[50]!,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  failureText: {
    flex: 1,
    fontSize: 12,
    color: colors.danger[600]!,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButton: {
    borderColor: colors.danger[600]!,
    backgroundColor: colors.danger[50]!,
  },
  retryButton: {
    borderColor: colors.primary[600]!,
    backgroundColor: colors.primary[50]!,
  },
  viewButton: {
    borderColor: colors.border.DEFAULT,
    backgroundColor: colors.surface.DEFAULT,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
