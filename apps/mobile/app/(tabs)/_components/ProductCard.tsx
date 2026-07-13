import React from 'react';
import { View, Pressable } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { AppImage } from '@/components/AppImage';
import { isProductOutOfStock } from '@/utils/productPrice';
import { OutOfStockOverlay } from '@/components/product';
import { styles } from '../_lib/styles';

const { colors } = theme;

function ProductCardBase({
  item,
  index,
  inCart,
  onPress,
}: {
  item: any;
  index: number;
  inCart: boolean;
  onPress: (id: string) => void;
}) {
  const isTradeEnabled = item.isTradeEnabled || item.trade_available;
  const viewCount = item.viewCount || item.views || 0;
  const brandLabel =
    typeof item.brand === 'object' && item.brand !== null ? (item.brand.name ?? '') : (item.brand ?? '');
  const scaleLabel =
    typeof item.scale === 'object' && item.scale !== null ? (item.scale.name ?? '') : (item.scale ?? '');
  const metaLabel = [brandLabel, scaleLabel].filter(Boolean).join(' • ');

  return (
    <Pressable
      key={item.id || index}
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.productCardWrapper, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Card style={styles.productCard} padding={0}>
        <View style={styles.productImageContainer}>
          <AppImage
            source={item.images}
            variant="card"
            style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
            resizeMode="cover"
          />
          {isProductOutOfStock(item) && <OutOfStockOverlay />}
          {(isTradeEnabled || item.isBoosted || item.boostedUntil) && (
            <View style={styles.topLeftStack}>
              {isTradeEnabled && (
                <View style={[styles.badge, { backgroundColor: colors.success[500]! }]}>
                  <Ionicons name="swap-horizontal" size={10} color={colors.white} />
                  <Text variant="caption" tone="inverted" weight="bold"> Takas</Text>
                </View>
              )}
              {(item.isBoosted || item.boostedUntil) && (
                <View style={[styles.badge, { backgroundColor: colors.warning[500]! }]}>
                  <Ionicons name="rocket" size={10} color={colors.white} />
                  <Text variant="caption" tone="inverted" weight="bold"> Sponsorlu</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.likesContainer}>
            <Ionicons name="eye-outline" size={14} color={colors.text.muted} />
            <Text variant="caption" tone="muted" style={{ marginLeft: theme.spacing[0.5] }}>{viewCount}</Text>
          </View>
          {inCart && (
            <View style={styles.inCartPill}>
              <Ionicons name="checkmark-circle" size={13} color={colors.white} />
              <Text variant="caption" tone="inverted" weight="bold" style={{ marginLeft: theme.spacing[1] }}>Sepette</Text>
            </View>
          )}
        </View>
        <View style={styles.productContent}>
          <Text variant="bodySm" weight="semibold" numberOfLines={2}>{item.title}</Text>
          {metaLabel ? (
            <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing[0.5] }}>{metaLabel}</Text>
          ) : null}
          <Text variant="h3" tone="primary" style={{ marginTop: theme.spacing[1] }}>
            ₺{item.price?.toLocaleString('tr-TR') || 0}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export const ProductCard = React.memo(ProductCardBase);
