import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { Card, Text, theme } from '@tarodan/ui-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { formatCondition } from '@/utils/format';
import { getOrderProductImageUri } from '@/utils/orderProductImage';
import { formatPrice } from '../_lib/format';
import type { OrderDetail } from '../_lib/types';

const { colors, radius } = theme;

export function OrderProductCard({ order }: { order: OrderDetail }) {
  return (
    <Card variant="elevated" style={styles.card}>
      <Pressable onPress={() => router.push(`/product/${order.product.id}`)}>
        <View style={styles.productCard}>
          <Image source={{ uri: getOrderProductImageUri(order.product) }} style={styles.productImage} />
          <View style={styles.productInfo}>
            <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
            <Text variant="caption" style={styles.conditionText}>Durum: {formatCondition(order.product?.condition)}</Text>
            <Text variant="h3" style={styles.productPrice}>{formatPrice(order.product.price)}</Text>
          </View>
        </View>
      </Pressable>
    </Card>
  );
}

export function OrderSellerCard({ order }: { order: OrderDetail }) {
  return (
    <Card variant="elevated" style={styles.card}>
      <Pressable onPress={() => router.push(`/seller/${order.seller.id}`)}>
        <View style={styles.sellerCard}>
          <Ionicons name="storefront" size={24} color={colors.primary[600]!} />
          <View style={styles.sellerInfo}>
            <Text variant="label">{order.seller.displayName}</Text>
            <Text variant="caption" style={styles.sellerLink}>Satıcı Profilini Görüntüle</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing[3] },
  productCard: { flexDirection: 'row' },
  productImage: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.surface.alt },
  productInfo: { flex: 1, marginLeft: theme.spacing[3] },
  conditionText: { color: colors.text.muted, marginTop: theme.spacing[1] },
  productPrice: { color: colors.primary[600]!, fontWeight: 'bold', marginTop: theme.spacing[1] },
  sellerCard: { flexDirection: 'row', alignItems: 'center' },
  sellerInfo: { flex: 1, marginLeft: theme.spacing[3] },
  sellerLink: { color: colors.primary[600]! },
});
