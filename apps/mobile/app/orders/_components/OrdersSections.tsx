import React from 'react';
import { View, ScrollView, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, StatusBadge, Text, theme } from '@tarodan/ui-native';

import { getOrderProductImageUri } from '@/utils/orderProductImage';
import type { UiOrderStatus } from '@/utils/orderStatus';
import { styles } from '../_lib/ordersStyles';
import {
  uiOrderStatusConfig,
  getStatusText,
  formatOrderDate,
  formatOrderPrice,
  type Order,
  type OrderGroup,
  type FilterType,
} from '../_lib/ordersStatus';
import { OrderCard } from './OrderCard';
import type { OrdersController } from '../_hooks/useOrders';

const { colors } = theme;

const FILTER_ORDER: FilterType[] = ['all', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'refunds'];

// ---------------------------------------------------------------------------
// Not-authenticated gate
// ---------------------------------------------------------------------------
export function OrdersGate({ f }: { f: OrdersController }) {
  if (f.isAuthenticated) return null;
  return (
    <View style={styles.centeredContainer}>
      <Ionicons name="receipt-outline" size={64} color={colors.primary[600]!} />
      <Text variant="h2" style={styles.title}>Siparişlerim</Text>
      <Text style={styles.subtitle}>Siparişlerinizi görmek için giriş yapın</Text>
      <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------
export function OrdersFilters({ f }: { f: OrdersController }) {
  return (
    <View style={styles.filterContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {FILTER_ORDER.map((key) => (
          <Chip
            key={key}
            label={key === 'all' ? 'Tümü' : key === 'refunds' ? 'İadeler' : getStatusText(key as UiOrderStatus)}
            selected={f.filter === key}
            onPress={() => f.setFilter(key)}
            style={styles.filterChipSpacing}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function OrdersEmpty({ filter }: { filter: FilterType }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={80} color={colors.text.subtle} />
      <Text variant="h3" style={styles.emptyTitle}>
        {filter === 'all'
          ? 'Henüz siparişiniz yok'
          : filter === 'refunds'
            ? 'İade kaydınız yok'
            : `${getStatusText(filter as UiOrderStatus)} siparişiniz yok`}
      </Text>
      <Text style={styles.emptySubtitle}>Alışverişe başlayın!</Text>
      <Button
        variant="primary"
        title="Ürünleri Keşfet"
        onPress={() => router.push('/(tabs)/search')}
        style={styles.emptyButton}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Multi-item group card (accordion)
// ---------------------------------------------------------------------------
export function OrderGroupCard({
  group,
  isExpanded,
  onToggle,
  onRate,
}: {
  group: OrderGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onRate: (type: 'product' | 'seller', order: Order) => void;
}) {
  const itemCount = group.orders.length;
  const thumbs = group.orders.slice(0, 4);
  const extraCount = itemCount - thumbs.length;

  return (
    <View>
      {/* Özet kart — tekli sipariş kartıyla AYNI krom; kapalıyken de tek karta benzer. */}
      <Card variant="elevated" padding={0} style={styles.orderCard}>
        {/* Özet satırı — tıkla aç/kapa (accordion) */}
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
        >
          {/* 1. Başlık — tekli karttaki sipariş no / durum hizası */}
          <View style={styles.orderHeader}>
            <Text variant="caption" style={styles.orderNumber}>
              Çoklu Sipariş · {itemCount} ürün
            </Text>
            <StatusBadge status={group.status} config={uiOrderStatusConfig} size="sm" />
          </View>

          {/* 2. İçerik — tekli karttaki ürün görseli hizası (büyük thumbnaillar) */}
          <View style={styles.orderContent}>
            <View style={styles.thumbRow}>
              {thumbs.map((order, idx) => (
                <Image
                  key={order.id}
                  source={{ uri: getOrderProductImageUri(order.product) }}
                  style={[styles.thumb, idx > 0 && styles.thumbOverlap]}
                />
              ))}
              {extraCount > 0 && (
                <View style={[styles.thumb, styles.thumbOverlap, styles.thumbMore]}>
                  <Text variant="caption" style={styles.thumbMoreText}>
                    +{extraCount}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.productInfo}>
              <Text variant="label" numberOfLines={1}>
                {itemCount} ürünlük sepet
              </Text>
              <Text variant="caption" style={styles.sellerName}>
                Her ürün ayrı kargolanır
              </Text>
              <Text variant="caption" style={styles.sellerName}>
                {formatOrderDate(group.createdAt)}
              </Text>
            </View>
          </View>

          {/* 3. Alt — tekli karttaki satıcı / toplam hizası + aç-kapa */}
          <View style={styles.orderFooter}>
            <Text variant="caption" style={styles.dateText}>
              {isExpanded ? 'Ürünleri gizle' : 'Ürünleri gör'}
            </Text>
            <View style={styles.groupFooterRight}>
              <Text variant="h3" style={styles.price}>
                {formatOrderPrice(group.totalAmount)}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.text.muted}
              />
            </View>
          </View>
        </Pressable>
      </Card>

      {/* Açılınca: grubun ürünleri sol-bantlı bir kolonda KOMPAKT kartlar olarak
          görünür → hem küçük durur hem de sepete ait olduğu net belli olur. */}
      {isExpanded && (
        <View style={styles.groupItemsBand}>
          {group.orders.map((order) => (
            <OrderCard key={order.id} order={order} compact onRate={onRate} />
          ))}
        </View>
      )}
    </View>
  );
}
