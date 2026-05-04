import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ActivityIndicator, Snackbar, Switch, Divider } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '../../src/components/common';
import { ScreenHeader } from '../../src/components/common';
import { TarodanColors } from '../../src/theme';
import { membershipApi } from '../../src/services/api';
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
          <ActivityIndicator color={TarodanColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Üyelik Yönetimi" />
      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Current plan */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.headerRow}>
              <View style={styles.tierBadge}>
                <Ionicons name="sparkles-outline" size={16} color={TarodanColors.primary} />
                <Text style={styles.tierText}>{tierName}</Text>
              </View>
              {isPaid ? (
                <View style={styles.activeRow}>
                  <Ionicons name="checkmark-circle" size={18} color={TarodanColors.success} />
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
                    color={TarodanColors.primary}
                  />
                </View>
              </>
            ) : (
              <Text style={styles.helperText}>
                Şu anda ücretsiz üyeliği kullanıyorsunuz. Daha fazla özellik için planınızı yükseltin.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Actions */}
        {isPaid ? (
          <>
            <Button
              mode="contained"
              icon="swap-vertical"
              buttonColor={TarodanColors.primary}
              onPress={() => router.push('/membership' as any)}
              style={styles.actionBtn}
              contentStyle={{ paddingVertical: 4 }}
            >
              Plan Değiştir
            </Button>
            <Button
              mode="outlined"
              icon="close-circle-outline"
              textColor={TarodanColors.error}
              onPress={handleCancel}
              loading={cancelMutation.isPending}
              disabled={cancelMutation.isPending}
              style={[styles.actionBtn, { borderColor: TarodanColors.error }]}
            >
              Üyeliği İptal Et
            </Button>
          </>
        ) : (
          <Button
            mode="contained"
            icon="arrow-up-bold"
            buttonColor={TarodanColors.primary}
            onPress={() => router.push('/membership' as any)}
            style={styles.actionBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Üyeliği Yükselt
          </Button>
        )}

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={18} color={TarodanColors.info} />
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
    backgroundColor: TarodanColors.backgroundSecondary,
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
    backgroundColor: TarodanColors.background,
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
    backgroundColor: TarodanColors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tierText: {
    color: TarodanColors.primary,
    fontWeight: '700',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeText: {
    color: TarodanColors.success,
    fontWeight: '600',
    fontSize: 13,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  kvLabel: {
    color: TarodanColors.textSecondary,
    fontSize: 13,
  },
  kvValue: {
    color: TarodanColors.textPrimary,
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
    color: TarodanColors.textPrimary,
    marginBottom: 2,
  },
  autoSub: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    lineHeight: 17,
  },
  helperText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
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
    backgroundColor: TarodanColors.infoLight,
    borderRadius: 10,
    marginTop: 4,
  },
  helpText: {
    flex: 1,
    color: TarodanColors.info,
    fontSize: 12,
    lineHeight: 17,
  },
});
