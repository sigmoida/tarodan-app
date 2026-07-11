import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { Trade } from '../_lib/types';

const { colors } = theme;

export function TradeInfoCard({
  trade,
  isInitiator,
  otherParty,
}: {
  trade: Trade;
  isInitiator: boolean;
  otherParty: { id: string; displayName: string };
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeHeaderTop}>
          <Text variant="h3">Takas #{trade.tradeNumber}</Text>
          {trade.version && trade.version > 1 ? (
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>Karşı Teklif #{trade.version - 1}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" style={styles.dateText}>
          {format(new Date(trade.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr })}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.otherParty, pressed && { opacity: 0.85 }]}
        onPress={() => router.push(`/seller/${otherParty.id}`)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{otherParty.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.otherPartyInfo}>
          <Text variant="body">{isInitiator ? 'Alıcı' : 'Teklif Eden'}</Text>
          <Text variant="label">{otherParty.displayName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginTop: 0, backgroundColor: colors.surface.DEFAULT },
  tradeHeader: { marginBottom: 16 },
  tradeHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  versionBadge: { backgroundColor: colors.primary[100]!, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  versionBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary[700]! },
  dateText: { color: colors.text.muted, marginTop: 4 },
  otherParty: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: colors.white, fontWeight: 'bold', fontSize: 16 },
  otherPartyInfo: { flex: 1, marginLeft: 12 },
});
