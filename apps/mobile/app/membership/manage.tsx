import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { theme, Button, Card, Spinner, Snackbar, Switch, Divider, Text } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader, ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { membershipApi } from '../../src/services/api';

const { colors } = theme;
import { captureException } from '../../src/services/sentry';

/**
 * Üyelik yönetim ekranı.
 *
 * Web paritesi: apps/web/src/app/membership/manage/page.tsx
 *   - Mevcut üyelik (tier) ve sonraki fatura bilgisi
 *   - Otomatik yenileme aç/kapa  → membershipApi.setAutoRenew
 *   - Üyeliği iptal et            → membershipApi.cancel
 *   - Plan değiştir               → /pricing ekranı (mobil: /membership)
 *
 * Backend uçları (membership.controller.ts):
 *   GET    /membership/me
 *   POST   /membership/cancel
 *   PATCH  /membership/auto-renew
 */

interface MembershipMe {
  tier?: { type?: string; name?: string };
  tierType?: string;
  tierName?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillingDate?: string;
  nextBillingAmount?: number;
  autoRenew?: boolean;
  status?: string;
}

const TIER_NAMES: Record<string, string> = {
  free: 'Ücretsiz Üyelik',
  basic: 'Temel Üyelik',
  premium: 'Premium Üyelik',
  business: 'Business Üyelik',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR');
  } catch {
    return '—';
  }
}

function formatTL(amount?: number): string {
  if (amount == null) return '—';
  return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

export default function MembershipManageScreen() {
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  const { data, isLoading, refetch } = useQuery<MembershipMe | null>({
    queryKey: ['membership', 'me'],
    queryFn: async () => {
      const response = await membershipApi.getCurrentMembership();
      return response.data?.data ?? response.data ?? null;
    },
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  const tier = (data?.tier?.type ?? data?.tierType ?? 'free').toLowerCase();
  const tierName = data?.tier?.name ?? data?.tierName ?? TIER_NAMES[tier] ?? 'Ücretsiz Üyelik';
  const isPaid = tier !== 'free';
  const autoRenew = !!data?.autoRenew;

  const cancelMutation = useMutation({
    mutationFn: () => membershipApi.cancel(),
    onSuccess: () => {
      setSnackbar({ visible: true, message: 'Üyelik iptal talebi alındı.' });
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      refetch();
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'membership.cancel' } });
      const msg = error?.response?.data?.message || 'İptal işlemi başarısız.';
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'İptal işlemi başarısız.' });
    },
  });

  const autoRenewMutation = useMutation({
    mutationFn: (next: boolean) => membershipApi.setAutoRenew(next),
    onSuccess: (_res, next) => {
      setSnackbar({
        visible: true,
        message: next ? 'Otomatik yenileme açıldı.' : 'Otomatik yenileme kapatıldı.',
      });
      queryClient.invalidateQueries({ queryKey: ['membership'] });
      refetch();
    },
    onError: (error: any) => {
      captureException(error, { level: 'error', tags: { flow: 'membership.autoRenew' } });
      const msg = error?.response?.data?.message || 'İşlem başarısız.';
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'İşlem başarısız.' });
    },
  });

  const handleCancel = () => {
    Alert.alert(
      'Üyeliği İptal Et',
      'Üyeliğinizi iptal etmek istediğinize emin misiniz? Mevcut dönem sonuna kadar özelliklerinizi kullanmaya devam edebilirsiniz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ],
    );
  };

  const handleToggleAutoRenew = () => {
    autoRenewMutation.mutate(!autoRenew);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Üyelik Yönetimi" />
        <View style={styles.loadingBox}>
          <Spinner size="lg" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Üyelik Yönetimi" />
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Current plan */}
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.tierBadge}>
              <Ionicons name="sparkles-outline" size={16} color={colors.primary[600]!} />
              <Text style={styles.tierText}>{tierName}</Text>
            </View>
            {isPaid ? (
              <View style={styles.activeRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success[600]!} />
                <Text style={styles.activeText}>Aktif</Text>
              </View>
            ) : null}
          </View>

          {isPaid ? (
            <>
              <Divider style={{ marginVertical: 12 }} />
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Başlangıç</Text>
                <Text style={styles.kvValue}>{formatDate(data?.currentPeriodStart)}</Text>
              </View>
              <View style={styles.kvRow}>
                <Text style={styles.kvLabel}>Bitiş</Text>
                <Text style={styles.kvValue}>{formatDate(data?.currentPeriodEnd)}</Text>
              </View>
              {data?.nextBillingDate ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Sonraki Ödeme</Text>
                  <Text style={styles.kvValue}>
                    {formatDate(data.nextBillingDate)}
                    {data.nextBillingAmount != null ? ` · ${formatTL(data.nextBillingAmount)}` : ''}
                  </Text>
                </View>
              ) : null}

              <Divider style={{ marginVertical: 12 }} />

              {/* Auto-renew toggle */}
              <View style={styles.autoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.autoTitle}>Otomatik Yenileme</Text>
                  <Text style={styles.autoSub}>
                    {autoRenew
                      ? 'Üyeliğiniz dönem sonunda otomatik yenilenecek.'
                      : 'Kapalı — dönem sonunda üyeliğiniz sona erecek.'}
                  </Text>
                </View>
                <Switch
                  value={autoRenew}
                  onValueChange={handleToggleAutoRenew}
                  disabled={autoRenewMutation.isPending}
                />
              </View>
            </>
          ) : (
            <Text style={styles.helperText}>
              Şu anda ücretsiz üyeliği kullanıyorsunuz. Daha fazla özellik için planınızı yükseltin.
            </Text>
          )}
        </Card>

        {/* Actions */}
        {isPaid ? (
          <>
            <Button
              variant="primary"
              title="Plan Değiştir"
              icon="swap-vertical"
              onPress={() => router.push('/membership' as any)}
              style={styles.actionBtn}
            />
            <Button
              variant="outline"
              title="Üyeliği İptal Et"
              icon="close-circle-outline"
              onPress={handleCancel}
              isLoading={cancelMutation.isPending}
              disabled={cancelMutation.isPending}
              style={{ ...styles.actionBtn, borderColor: colors.danger[600]! }}
            />
          </>
        ) : (
          <Button
            variant="primary"
            title="Üyeliği Yükselt"
            icon="arrow-up"
            onPress={() => router.push('/membership' as any)}
            style={styles.actionBtn}
          />
        )}

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info[600]!} />
          <Text style={styles.helpText}>
            Üyelik ile ilgili sorularınız için destek ekibimizle iletişime geçebilirsiniz.
          </Text>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary[50]!,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tierText: {
    color: colors.primary[600]!,
    fontWeight: '700',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeText: {
    color: colors.success[600]!,
    fontWeight: '600',
    fontSize: 13,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  kvLabel: {
    color: colors.text.muted,
    fontSize: 13,
  },
  kvValue: {
    color: colors.text.heading,
    fontWeight: '600',
    fontSize: 13,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  autoTitle: {
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 2,
  },
  autoSub: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 17,
  },
  helperText: {
    fontSize: 13,
    color: colors.text.muted,
    marginTop: 12,
    lineHeight: 18,
  },
  actionBtn: {
    borderRadius: 10,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.info[50]!,
    borderRadius: 10,
    marginTop: 4,
  },
  helpText: {
    flex: 1,
    color: colors.info[600]!,
    fontSize: 12,
    lineHeight: 17,
  },
});
