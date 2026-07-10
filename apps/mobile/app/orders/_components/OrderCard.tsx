import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, StatusBadge, Text, theme } from '@tarodan/ui-native';

import { getOrderProductImageUri } from '@/utils/orderProductImage';
import { styles } from '../_lib/ordersStyles';
import {
  uiOrderStatusConfig,
  badgeStatusOf,
  canRateOrder,
  formatOrderDate,
  formatOrderPrice,
  type Order,
} from '../_lib/ordersStatus';

const { colors } = theme;

/** A single order card (also used compact inside a group's item band). */
export function OrderCard({
  order,
  compact = false,
  onRate,
}: {
  order: Order;
  compact?: boolean;
  onRate: (type: 'product' | 'seller', order: Order) => void;
}) {
  return (
    <Card variant="elevated" padding={0} style={styles.orderCard}>
      <Pressable onPress={() => router.push(`/orders/${order.id}`)}>
        <View style={styles.orderHeader}>
          <Text variant="caption" style={styles.orderNumber}>
            Sipariş #{order.orderNumber}
          </Text>
          <StatusBadge status={badgeStatusOf(order)} config={uiOrderStatusConfig} size="sm" />
        </View>

        <View style={styles.orderContent}>
          <Image
            source={{ uri: getOrderProductImageUri(order.product) }}
            style={compact ? styles.productImageSm : styles.productImage}
          />
          <View style={styles.productInfo}>
            <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
            <Text variant="caption" style={styles.sellerName}>
              Satıcı: {order.seller.displayName}
            </Text>
            <Text variant="h3" style={styles.price}>
              {formatOrderPrice(order.totalAmount)}
            </Text>
          </View>
        </View>

        <View style={styles.orderFooter}>
          <Text variant="caption" style={styles.dateText}>
            {formatOrderDate(order.createdAt)}
          </Text>

          {/* Tracking */}
          {order.trackingNumber && order.status === 'shipped' && (
            <Pressable
              style={styles.trackButton}
              onPress={() => router.push(`/order-track?orderNumber=${order.orderNumber}`)}
            >
              <Ionicons name="location" size={14} color={colors.primary[600]!} />
              <Text style={styles.trackButtonText}>Takip Et</Text>
            </Pressable>
          )}
        </View>
      </Pressable>

      {/* Değerlendirme — teslim/tamamlanmış siparişte (yeni escrow: ayrı "Teslim Aldım"
          onay butonu yok; satıcıya ödeme teslim+14 gün sonra otomatik serbest kalır) */}
      {canRateOrder(order) && (
        <View style={styles.ratingSection}>
          {!order.hasProductRating && (
            <Button
              variant="outline"
              size="sm"
              icon="star"
              title="Ürünü Değerlendir"
              onPress={() => onRate('product', order)}
              style={styles.rateButton}
            />
          )}
          {!order.hasSellerRating && (
            <Button
              variant="outline"
              size="sm"
              icon="person"
              title="Satıcıyı Değerlendir"
              onPress={() => onRate('seller', order)}
              style={styles.rateButton}
            />
          )}
        </View>
      )}
    </Card>
  );
}
