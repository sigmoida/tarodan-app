import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, StatusBadge, theme, tradeStatusConfig } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  TRADE_STATUSES,
  STATUS_DESCRIPTIONS,
  NEW_STATUS_KEYS,
  STEP_FLOW_STATUSES,
  deadlineForStatus,
  formatCountdown,
} from '../_lib/status';
import { TradeProgressStepper } from './TradeProgressStepper';
import type { Trade, TFn } from '../_lib/types';

const { colors } = theme;

/** Üst statü blokları: banner + açıklama + geri sayım + stepper + tamamlandı/depo/iade kartları. */
export function TradeStatusHeader({ trade, t, now }: { trade: Trade; t: TFn; now: number }) {
  const statusInfoBase =
    TRADE_STATUSES[trade.status as keyof typeof TRADE_STATUSES] || TRADE_STATUSES.pending;
  const statusInfo = NEW_STATUS_KEYS[trade.status]
    ? { ...statusInfoBase, label: t(NEW_STATUS_KEYS[trade.status]) }
    : statusInfoBase;
  const hasBadge = !!tradeStatusConfig[trade.status];
  const countdown = formatCountdown(deadlineForStatus(trade), now);
  const statusDescription = STATUS_DESCRIPTIONS[trade.status];

  return (
    <>
      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: statusInfo.color + '15' }]}>
        <Ionicons name={statusInfo.icon as any} size={24} color={statusInfo.color} />
        <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        {hasBadge ? <StatusBadge status={trade.status} config={tradeStatusConfig} size="sm" /> : null}
      </View>

      {/* Status description — özel kartı olan statülerde tekrar olmasın diye gizlenir. */}
      {statusDescription &&
        !['completed', 'at_warehouse', 'admin_reviewing', 'returning'].includes(trade.status) && (
          <View style={styles.descCard}>
            <Text variant="bodySm" tone="body">{statusDescription}</Text>
            {trade.cancelReason && (trade.status === 'cancelled' || trade.status === 'rejected') ? (
              <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                Sebep: {trade.cancelReason}
              </Text>
            ) : null}
          </View>
        )}

      {/* Countdown */}
      {countdown && (
        <View style={styles.countdownCard}>
          <Ionicons name="time-outline" size={20} color={colors.primary[600]!} />
          <View style={{ flex: 1 }}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text variant="caption" tone="muted">Lütfen süre dolmadan işleminizi tamamlayın</Text>
          </View>
        </View>
      )}

      {/* Progress Stepper (depo-escrow akışı) */}
      {STEP_FLOW_STATUSES.has(trade.status) && (
        <Card style={styles.card}>
          <TradeProgressStepper
            status={trade.status}
            hasCash={trade.cashAmount != null && Number(trade.cashAmount) > 0}
          />
        </Card>
      )}

      {/* Completed summary */}
      {trade.status === 'completed' && (
        <Card style={{ ...styles.card, ...styles.completedCard }}>
          <View style={styles.completedHeader}>
            <Ionicons name="checkmark-done-circle" size={28} color={colors.success[600]!} />
            <Text variant="h3" style={{ color: colors.success[700]!, flex: 1 }}>Takas Tamamlandı</Text>
          </View>
          <Text variant="caption" tone="muted" style={{ marginBottom: 12 }}>
            Takas başarıyla tamamlandı. İyi günlerde kullanın!
          </Text>
          <View style={styles.summaryDateRow}>
            <Text variant="caption" tone="muted">Oluşturuldu</Text>
            <Text variant="bodySm">{format(new Date(trade.createdAt), 'd MMM yyyy', { locale: tr })}</Text>
          </View>
          {trade.acceptedAt ? (
            <View style={styles.summaryDateRow}>
              <Text variant="caption" tone="muted">Kabul Edildi</Text>
              <Text variant="bodySm">{format(new Date(trade.acceptedAt), 'd MMM yyyy', { locale: tr })}</Text>
            </View>
          ) : null}
          {trade.completedAt ? (
            <View style={styles.summaryDateRow}>
              <Text variant="caption" tone="muted">Tamamlandı</Text>
              <Text variant="bodySm">{format(new Date(trade.completedAt), 'd MMM yyyy', { locale: tr })}</Text>
            </View>
          ) : null}
          <View style={styles.completedActions}>
            <Button variant="outline" title="Takaslarım" onPress={() => router.replace('/trades' as any)} style={{ flex: 1 }} />
            <Button variant="primary" title="İlanlara Göz At" onPress={() => router.push('/search')} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {/* Warehouse review banner */}
      {(trade.status === 'at_warehouse' || trade.status === 'admin_reviewing') && (
        <Card style={{ ...styles.card, ...styles.infoBanner }}>
          <View style={styles.bannerRow}>
            <View style={styles.bannerIconCircle}>
              <Ionicons name="shield-checkmark" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ color: colors.info[700]! }}>Ürünleriniz Tarodan Deposunda</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Ekibimiz ürünleri inceliyor. İnceleme tamamlandığında bilgilendirileceksiniz.
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Returning banner */}
      {trade.status === 'returning' && (
        <Card style={{ ...styles.card, ...styles.warningBanner }}>
          <View style={styles.bannerRow}>
            <View style={[styles.bannerIconCircle, { backgroundColor: colors.warning[500]! }]}>
              <Ionicons name="return-up-back" size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" style={{ color: colors.warning[800]! }}>Takas Reddedildi</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>Ürünleriniz size iade ediliyor.</Text>
              {trade.cancelReason ? (
                <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>Sebep: {trade.cancelReason}</Text>
              ) : null}
            </View>
          </View>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    gap: 8,
  },
  statusText: { fontSize: 16, fontWeight: '600', flex: 1 },
  card: { margin: 16, marginTop: 0, backgroundColor: colors.surface.DEFAULT },
  descCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface.DEFAULT,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  countdownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.primary[50]!,
    borderWidth: 1,
    borderColor: colors.primary[100]!,
  },
  countdownText: { fontSize: 18, fontWeight: '700', color: colors.primary[800]!, fontFamily: 'Courier' },
  completedCard: { backgroundColor: colors.success[50]!, borderWidth: 1, borderColor: colors.success[200]! },
  completedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  summaryDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.success[200]!,
  },
  completedActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  infoBanner: { backgroundColor: colors.info[50]!, borderWidth: 1, borderColor: colors.info[200]! },
  warningBanner: { backgroundColor: colors.warning[50]!, borderWidth: 1, borderColor: colors.warning[200]! },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.info[500]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
