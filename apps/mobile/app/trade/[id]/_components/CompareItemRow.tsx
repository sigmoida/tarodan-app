import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveImageUrl } from '@/utils/imageUrl';
import { formatPrice } from '@/utils/format';
import type { TradeItem } from '../_lib/types';

const { colors } = theme;

export function CompareItemRow({ item, onPress }: { item: TradeItem; onPress: () => void }) {
  const qty = Number(item.quantity) || 1;
  return (
    <Pressable style={({ pressed }) => [styles.cmpItemRow, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <Image
        source={{ uri: resolveImageUrl(item.productImages?.[0] ?? item.productImage ?? item.product?.images) }}
        style={styles.cmpThumb}
      />
      <View style={styles.itemInfo}>
        <Text variant="bodySm" weight="medium" numberOfLines={1}>
          {item.productTitle || item.product?.title || 'Ürün'}
        </Text>
        <Text variant="caption" tone="muted">
          {qty}x · {formatPrice(item.valueAtTrade)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.text.subtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cmpItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    backgroundColor: colors.surface.alt,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[2],
  },
  cmpThumb: { width: 52, height: 52, borderRadius: theme.radius.lg, backgroundColor: colors.border.subtle },
  itemInfo: { flex: 1 },
});
