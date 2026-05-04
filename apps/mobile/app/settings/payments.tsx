import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Card, Chip, Snackbar, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, ScreenHeader, EmptyState } from '../../src/components/common';
import { TarodanColors } from '../../src/theme';
import { useAuthStore } from '../../src/stores/authStore';
import { paymentsApi } from '../../src/services/api';
import { formatPrice } from '../../src/utils/format';

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
  completed: { bg: TarodanColors.successLight, fg: TarodanColors.success, label: 'Tamamlandı', icon: 'checkmark-circle' },
  pending: { bg: TarodanColors.warningLight, fg: TarodanColors.warning, label: 'Bekliyor', icon: 'time-outline' },
  failed: { bg: TarodanColors.errorLight, fg: TarodanColors.error, label: 'Başarısız', icon: 'close-circle' },
  cancelled: { bg: TarodanColors.surfaceVariant, fg: TarodanColors.textSecondary, label: 'İptal', icon: 'ban-outline' },
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
    Alert.alert(
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
              Alert.alert('Hata', e?.response?.data?.message || 'Ödeme iptal edilemedi.');
            }
          },
        },
      ],
    );
  };

  const handleRetry = (id: string) => {
    Alert.alert(
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
              Alert.alert('Hata', e?.response?.data?.message || 'Yeniden denenemedi.');
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
            selected={statusFilter === opt.value}
            onPress={() => setStatusFilter(opt.value)}
            style={[styles.filterChip, statusFilter === opt.value && styles.filterChipActive]}
            textStyle={statusFilter === opt.value ? styles.filterChipTextActive : undefined}
          >
            {opt.label}
          </Chip>
        ))}
      </ScrollView>

      {paymentsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
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
              colors={[TarodanColors.primary]}
            />
          }
        >
          {payments.map((p) => {
            const status = STATUS_COLORS[p.status] ?? STATUS_COLORS.pending;
            return (
              <Card key={p.id} style={styles.paymentCard}>
                <Card.Content>
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
                      <Ionicons name="card-outline" size={13} color={TarodanColors.textSecondary} />
                      <Text style={styles.providerText}>{p.provider?.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={styles.dateText}>{formatDate(p.paidAt || p.createdAt)}</Text>

                  {p.failureReason ? (
                    <View style={styles.failureBox}>
                      <Ionicons name="alert-circle" size={14} color={TarodanColors.error} />
                      <Text style={styles.failureText}>{p.failureReason}</Text>
                    </View>
                  ) : null}

                  <View style={styles.actions}>
                    {p.status === 'pending' && (
                      <TouchableOpacity
                        onPress={() => handleCancel(p.id)}
                        style={[styles.actionButton, styles.cancelButton]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={TarodanColors.error} />
                        <Text style={[styles.actionLabel, { color: TarodanColors.error }]}>İptal</Text>
                      </TouchableOpacity>
                    )}
                    {p.status === 'failed' && (
                      <TouchableOpacity
                        onPress={() => handleRetry(p.id)}
                        style={[styles.actionButton, styles.retryButton]}
                      >
                        <Ionicons name="refresh" size={16} color={TarodanColors.primary} />
                        <Text style={[styles.actionLabel, { color: TarodanColors.primary }]}>Yeniden Dene</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/orders/[id]', params: { id: p.orderId } } as any)}
                      style={[styles.actionButton, styles.viewButton]}
                    >
                      <Ionicons name="receipt-outline" size={16} color={TarodanColors.textSecondary} />
                      <Text style={[styles.actionLabel, { color: TarodanColors.textSecondary }]}>Sipariş</Text>
                    </TouchableOpacity>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={2000}
        style={{ backgroundColor: TarodanColors.success }}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  filterScroll: {
    backgroundColor: TarodanColors.background,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.borderLight,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipActive: {
    backgroundColor: TarodanColors.primaryLight,
  },
  filterChipTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
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
    backgroundColor: TarodanColors.background,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.borderLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
    fontWeight: '500',
  },
  dateText: {
    fontSize: 12,
    color: TarodanColors.textTertiary,
    marginBottom: 8,
  },
  failureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TarodanColors.errorLight,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  failureText: {
    flex: 1,
    fontSize: 12,
    color: TarodanColors.error,
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
    borderColor: TarodanColors.error,
    backgroundColor: TarodanColors.errorLight,
  },
  retryButton: {
    borderColor: TarodanColors.primary,
    backgroundColor: TarodanColors.primaryLight,
  },
  viewButton: {
    borderColor: TarodanColors.border,
    backgroundColor: TarodanColors.background,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
