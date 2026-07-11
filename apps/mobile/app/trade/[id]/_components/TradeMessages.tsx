import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import type { Trade } from '../_lib/types';

const { colors } = theme;

export function TradeMessages({ trade }: { trade: Trade }) {
  if (!(trade.initiatorMessage || trade.receiverMessage)) return null;
  return (
    <Card style={styles.card}>
      <Text variant="label" style={styles.sectionTitle}>Mesajlar</Text>
      {trade.initiatorMessage && (
        <View style={styles.messageBox}>
          <Text variant="caption" style={styles.messageSender}>{trade.initiatorName ?? 'Kullanıcı'}:</Text>
          <Text variant="body">{trade.initiatorMessage}</Text>
        </View>
      )}
      {trade.receiverMessage && (
        <View style={styles.messageBox}>
          <Text variant="caption" style={styles.messageSender}>{trade.receiverName ?? 'Kullanıcı'}:</Text>
          <Text variant="body">{trade.receiverMessage}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginTop: 0, backgroundColor: colors.surface.DEFAULT },
  sectionTitle: { marginBottom: 12, color: colors.text.heading },
  messageBox: { backgroundColor: colors.surface.alt, padding: 12, borderRadius: 8, marginBottom: 8 },
  messageSender: { color: colors.primary[600]!, fontWeight: '500', marginBottom: 4 },
});
