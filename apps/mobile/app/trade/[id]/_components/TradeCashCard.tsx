import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatPrice } from '@/utils/format';
import type { Trade } from '../_lib/types';

const { colors } = theme;

export function TradeCashCard({
  trade,
  userId,
  otherPartyName,
  cashPaid,
  cashCommission,
  cashTotal,
}: {
  trade: Trade;
  userId?: string;
  otherPartyName: string;
  cashPaid: boolean;
  cashCommission: number;
  cashTotal: number;
}) {
  if (!(trade.cashAmount != null && Number(trade.cashAmount) > 0)) return null;

  return (
    <Card style={{ ...styles.card, ...styles.cashCard }}>
      <View style={styles.cashHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">Nakit Fark</Text>
          <Text variant="h2" style={styles.cashBig}>{formatPrice(Math.abs(Number(trade.cashAmount ?? 0)))}</Text>
          {cashCommission > 0 && cashTotal > 0 ? (
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing[0.5] }}>
              Komisyon dahil toplam: {formatPrice(cashTotal)}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing[0.5] }}>
            {trade.cashPayerId === userId ? 'Bu tutarı siz ödeyeceksiniz' : `${otherPartyName} ödeyecek`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: theme.spacing[1.5] }}>
          <MaterialCommunityIcons name="cash-multiple" size={28} color={colors.success[600]!} />
          {cashPaid ? (
            <View style={styles.paidChip}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success[700]!} />
              <Text style={styles.paidChipText}>Ödendi</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { margin: theme.spacing[4], marginTop: theme.spacing[0], backgroundColor: colors.surface.DEFAULT },
  cashCard: { backgroundColor: colors.success[50]!, borderWidth: 1, borderColor: colors.success[200]! },
  cashHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  cashBig: { color: colors.success[700]!, fontWeight: 'bold', marginTop: theme.spacing[0.5] },
  paidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[1],
    backgroundColor: colors.success[100]!,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    borderRadius: 999,
  },
  paidChipText: { fontSize: 12, fontWeight: '700', color: colors.success[700]! },
});
