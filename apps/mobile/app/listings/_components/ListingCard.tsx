import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, theme } from '@tarodan/ui-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppImage } from '@/components/AppImage';
import { isProductOutOfStock } from '@/utils/productPrice';
import { OutOfStockOverlay } from '@/components/product';
import { asLabel } from '@/utils/format';
import { styles } from '../_lib/styles';
import { conditionLabel } from '../_lib/chips';

const { colors } = theme;

/** 2-sütun grid ürün kartı (memoized — #75). */
function ListingCardBase({ item }: { item: any }) {
  const isTradeEnabled = item.isTradeEnabled || item.trade_available || item.tradeAvailable;
  return (
    <TouchableOpacity style={styles.productCard} onPress={() => router.push(`/product/${item.id}`)}>
      <View style={styles.productImageContainer}>
        <AppImage
          source={item.images}
          variant="card"
          style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
        />
        {isProductOutOfStock(item) && <OutOfStockOverlay />}
        {isTradeEnabled && (
          <View style={styles.tradeBadge}>
            <Ionicons name="swap-horizontal" size={12} color={colors.white} />
            <Text style={styles.tradeBadgeText}>Takas</Text>
          </View>
        )}
      </View>
      <View style={styles.productContent}>
        <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.productMeta}>
          {asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
          {item.condition && <Text style={styles.conditionBadge}>{conditionLabel(item.condition)}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export const ListingCard = React.memo(ListingCardBase);
