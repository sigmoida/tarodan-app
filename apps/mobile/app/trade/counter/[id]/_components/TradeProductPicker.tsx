import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text, theme } from '@tarodan/ui-native';

import { formatPrice } from '../../../../../src/utils/format';
import { transformImageUrl } from '../../../../../src/utils/imageUrl';
import { styles } from '../_lib/styles';
import { itemId, type TradeItem } from '../_lib/types';

const { colors } = theme;

/** A titled grid of tradeable products with multi-select toggle. */
export function TradeProductPicker({
  title,
  subtitle,
  products,
  selected,
  toggle,
}: {
  title: string;
  subtitle: string;
  products: any[];
  selected: TradeItem[];
  toggle: (p: any) => void;
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.section}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      {products.length === 0 ? (
        <Text style={styles.emptyText}>Takasa uygun ürün bulunamadı.</Text>
      ) : (
        <View style={styles.grid}>
          {products.map(p => {
            const isSelected = !!selected.find(x => itemId(x) === p.id);
            const img = p.images?.[0]?.cardUrl || p.images?.[0]?.url || p.images?.[0];
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.gridItem,
                  isSelected && styles.gridItemSelected,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => toggle(p)}
              >
                <View style={styles.gridImgWrap}>
                  <Image source={{ uri: transformImageUrl(img) }} style={styles.gridImg} />
                  {isSelected ? (
                    <View style={styles.selectedOverlay}>
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark" size={16} color={colors.white} />
                      </View>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.productTitle} numberOfLines={2}>{p.title}</Text>
                <Text style={styles.productPrice}>{formatPrice(p.price)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
