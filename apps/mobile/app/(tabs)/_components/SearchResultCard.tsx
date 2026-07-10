import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text, theme } from '@tarodan/ui-native';

import { getImageUrl as getImageUrlFromUtils } from '../../../src/utils/imageUrl';
import { isProductOutOfStock } from '../../../src/utils/productPrice';
import { OutOfStockOverlay } from '../../../src/components/product';
import { asLabel } from '../../../src/utils/format';
import { styles } from '../_lib/searchStyles';

const { colors } = theme;

/** A single product card in the 2-column search results grid. */
export function SearchResultCard({
  item,
  cartProductIds,
  onPress,
}: {
  item: any;
  cartProductIds: Set<string>;
  onPress: (productId: string) => void;
}) {
  const imageUrl = getImageUrlFromUtils(item.images);
  const ratingAvg = item.rating?.average ? Number(item.rating.average) : 0;
  const ratingCount = item.rating?.count ?? item.reviewCount ?? 0;
  const price = item.price ?? item.salePrice ?? null;
  const oldPrice = item.originalPrice ?? item.oldPrice ?? null;
  const hasDiscount = oldPrice != null && price != null && Number(oldPrice) > Number(price);
  const discountPercent =
    item.discountPercent ??
    (hasDiscount ? Math.round((1 - Number(price) / Number(oldPrice)) * 100) : 0);
  return (
    <Pressable
      testID="search-result-card"
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.productCardWrapper, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Card style={styles.productCard} padding={0}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: imageUrl }}
            style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
            resizeMode="cover"
          />
          {isProductOutOfStock(item) && <OutOfStockOverlay />}
          {(item.tradeAvailable || item.isTradeEnabled) && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color={colors.white} />
              <Text variant="caption" tone="inverted" weight="bold">
                Takas
              </Text>
            </View>
          )}
          {item.condition === 'new' && (
            <View style={[styles.conditionBadge, { backgroundColor: colors.success[600]! }]}>
              <Text variant="caption" tone="inverted" weight="bold">
                Sıfır
              </Text>
            </View>
          )}
          {cartProductIds.has(item.id) && (
            <View style={styles.inCartPill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text variant="caption" tone="inverted" weight="bold" style={{ marginLeft: 4 }}>
                Sepette
              </Text>
            </View>
          )}
        </View>
        <View style={styles.productContent}>
          <Text variant="bodySm" weight="semibold" numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}
          </Text>
          {ratingAvg > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
              <Ionicons name="star" size={12} color={colors.warning[500]!} />
              <Text variant="caption" tone="muted">
                {ratingAvg.toFixed(1)}
                {ratingCount ? ` (${ratingCount})` : ''}
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 4,
            }}
          >
            <Text variant="h3" tone="primary">
              ₺{Number(price ?? 0).toLocaleString('tr-TR')}
            </Text>
            {hasDiscount ? (
              <Text
                variant="caption"
                tone="muted"
                style={{ textDecorationLine: 'line-through' }}
              >
                ₺{Number(oldPrice).toLocaleString('tr-TR')}
              </Text>
            ) : null}
            {discountPercent > 0 ? (
              <View
                style={{
                  backgroundColor: colors.danger[600]!,
                  borderRadius: 4,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                }}
              >
                <Text variant="caption" tone="inverted" weight="bold">
                  %{discountPercent}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
