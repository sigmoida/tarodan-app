import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, theme } from '@tarodan/ui-native';

import { getImageUrl } from '@/utils/imageUrl';
import { getProductEffectivePrice } from '@/utils/productPrice';
import { formatPrice } from '@/utils/format';
import { styles } from '../_lib/styles';
import type { Product } from '../_lib/types';

const { colors } = theme;

/** Selectable product row used in both "my items" and "their items" steps. */
export function TradeProductCard({
  product,
  isSelected,
  onToggle,
}: {
  product: Product;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.productCard,
        isSelected && styles.productCardSelected,
        pressed && { opacity: 0.85 },
      ]}
      onPress={onToggle}
    >
      <Image source={{ uri: getImageUrl(product.images) }} style={styles.productImage} />
      <View style={styles.productInfo}>
        <Text variant="body" numberOfLines={2} style={styles.productTitle}>
          {product.title}
        </Text>
        <Text variant="caption" style={styles.productPrice}>
          {formatPrice(getProductEffectivePrice(product))}
        </Text>
      </View>
      <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
        {isSelected && <Ionicons name="checkmark" size={16} color={colors.white} />}
      </View>
    </Pressable>
  );
}
