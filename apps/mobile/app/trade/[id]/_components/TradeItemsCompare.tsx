import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatPrice } from '@/utils/format';
import { CompareItemRow } from './CompareItemRow';
import type { TradeItem } from '../_lib/types';

const { colors } = theme;

const openProduct = (item: TradeItem) => {
  const pid = item.productId ?? item.product?.id;
  if (pid) router.push(`/product/${pid}`);
};

function ItemSide({ label, items }: { label: string; items: TradeItem[] }) {
  return (
    <>
      <Text variant="overline" tone="muted" style={styles.sideLabel}>{label}</Text>
      <View style={{ gap: 8 }}>
        {items.length > 0 ? (
          items.map((item) => <CompareItemRow key={item.id} item={item} onPress={() => openProduct(item)} />)
        ) : (
          <Text variant="caption" tone="subtle">Ürün yok</Text>
        )}
      </View>
    </>
  );
}

export function TradeItemsCompare({
  myItems,
  theirItems,
  myTotal,
  theirTotal,
  otherPartyName,
}: {
  myItems: TradeItem[];
  theirItems: TradeItem[];
  myTotal: number;
  theirTotal: number;
  otherPartyName: string;
}) {
  return (
    <Card style={styles.card}>
      <ItemSide label="Senin Ürünlerin" items={myItems} />
      <View style={styles.cmpTotalRow}>
        <Text variant="caption" tone="muted">Toplam Değer</Text>
        <Text variant="h3" style={styles.cmpTotalValue}>{formatPrice(myTotal)}</Text>
      </View>

      <View style={styles.arrowRow}>
        <View style={styles.arrowLine} />
        <View style={styles.arrowCircle}>
          <Ionicons name="swap-vertical" size={18} color={colors.primary[600]!} />
        </View>
        <View style={styles.arrowLine} />
      </View>

      <ItemSide label={`${otherPartyName} Ürünleri`} items={theirItems} />
      <View style={styles.cmpTotalRow}>
        <Text variant="caption" tone="muted">Toplam Değer</Text>
        <Text variant="h3" style={styles.cmpTotalValue}>{formatPrice(theirTotal)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { margin: 16, marginTop: 0, backgroundColor: colors.surface.DEFAULT },
  sideLabel: { marginBottom: 10 },
  cmpTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  cmpTotalValue: { color: colors.primary[700]!, fontWeight: 'bold' },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 },
  arrowLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border.DEFAULT },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50]!,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
