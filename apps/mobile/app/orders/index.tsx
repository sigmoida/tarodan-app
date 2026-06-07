import { View, ScrollView, StyleSheet, Pressable, Image, RefreshControl } from 'react-native';
import {
  Button,
  Chip,
  Spinner,
  Card,
  StatusBadge,
  Text,
  theme,
} from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { BadgeVariant } from '@tarodan/ui-native';
import { ordersApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import RatingModal from '../../src/components/RatingModal';
import { apiStatusToUi, uiFilterToApiStatusParam, type UiOrderStatus } from '../../src/utils/orderStatus';
import { getOrderProductImageUri } from '../../src/utils/orderProductImage';

const { colors, spacing, radius } = theme;

interface Order {
  id: string;
  orderNumber: string;
  status: UiOrderStatus;
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
    imageUrl?: string;
  };
  seller: {
    id: string;
    displayName: string;
  };
  trackingNumber?: string;
  createdAt: string;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
}

type FilterType = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed';

// UI status keys -> StatusBadge config (matches semantic Badge variants)
const uiOrderStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
  refunded: { label: 'İade', variant: 'secondary' },
};

const getStatusText = (status: UiOrderStatus) =>
  uiOrderStatusConfig[status]?.label ?? String(status);

export default function OrdersScreen() {
  const { isAuthenticated } = useAuthStore();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
    order: Order | null;
  }>({ visible: false, type: 'product', order: null });

  // Fetch orders
  const { data: ordersData, isLoading, refetch, error: ordersError } = useQuery({
    queryKey: ['orders', role, filter],
    queryFn: async () => {
      const params: Record<string, string | number> = { role, limit: 100, page: 1 };
      const apiStatus = uiFilterToApiStatusParam(filter);
      if (apiStatus) params.status = apiStatus;

      const response = await ordersApi.getAll(params);
      const raw = response.data?.data ?? response.data;
      const list = Array.isArray(raw) ? raw : [];

      const normalized: Order[] = list.map((rawOrder: any) => ({
        ...rawOrder,
        status: apiStatusToUi(rawOrder.status),
        totalAmount: Number(rawOrder.totalAmount ?? rawOrder.amount ?? 0),
        product: {
          ...(rawOrder.product || {}),
          id: rawOrder.product?.id ?? '',
          title: rawOrder.product?.title ?? '',
          images: rawOrder.product?.images,
          imageUrl: rawOrder.product?.imageUrl,
        },
      }));

      if (filter === 'processing') {
        return normalized.filter((o) => o.status === 'processing');
      }
      return normalized;
    },
    enabled: isAuthenticated,
  });

  const orders: Order[] = ordersData || [];

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        refetch();
      }
    }, [isAuthenticated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatPrice = (price: number) => {
    return `₺${price.toLocaleString('tr-TR')}`;
  };

  const canRate = (order: Order) => {
    return ['delivered', 'completed'].includes(order.status);
  };

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="receipt-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>Siparişlerim</Text>
        <Text style={styles.subtitle}>
          Siparişlerinizi görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>{role === 'buyer' ? 'Siparişlerim' : 'Satışlarım'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Role Toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <Chip
          label="Aldıklarım"
          selected={role === 'buyer'}
          onPress={() => { setRole('buyer'); setFilter('all'); }}
        />
        <Chip
          label="Sattıklarım"
          selected={role === 'seller'}
          onPress={() => { setRole('seller'); setFilter('all'); }}
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'pending', 'processing', 'shipped', 'delivered', 'completed'] as FilterType[]).map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'Tümü' : getStatusText(f as UiOrderStatus)}
              selected={filter === f}
              onPress={() => setFilter(f)}
              style={styles.filterChipSpacing}
            />
          ))}
        </ScrollView>
      </View>

      {/* Orders */}
      {ordersError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptySubtitle}>
            Siparişler yüklenemedi. Lütfen tekrar deneyin.
          </Text>
          <Button variant="primary" title="Yenile" onPress={() => refetch()} style={{ marginTop: 12 }} />
        </View>
      ) : isLoading && orders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>
            {filter === 'all' ? 'Henüz siparişiniz yok' : `${getStatusText(filter as UiOrderStatus)} siparişiniz yok`}
          </Text>
          <Text style={styles.emptySubtitle}>
            Alışverişe başlayın!
          </Text>
          <Button variant="primary" title="Ürünleri Keşfet" onPress={() => router.push('/(tabs)/search')} />
        </View>
      ) : (
        <ScrollView
          style={styles.ordersList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {orders.map((order) => (
            <Card key={order.id} variant="elevated" padding={0} style={styles.orderCard}>
              <Pressable onPress={() => router.push(`/orders/${order.id}`)}>
                <View style={styles.orderHeader}>
                  <Text variant="caption" style={styles.orderNumber}>
                    Sipariş #{order.orderNumber}
                  </Text>
                  <StatusBadge status={order.status} config={uiOrderStatusConfig} size="sm" />
                </View>

                <View style={styles.orderContent}>
                  <Image
                    source={{ uri: getOrderProductImageUri(order.product) }}
                    style={styles.productImage}
                  />
                  <View style={styles.productInfo}>
                    <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
                    <Text variant="caption" style={styles.sellerName}>
                      Satıcı: {order.seller.displayName}
                    </Text>
                    <Text variant="h3" style={styles.price}>
                      {formatPrice(order.totalAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderFooter}>
                  <Text variant="caption" style={styles.dateText}>
                    {formatDate(order.createdAt)}
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

              {/* Rating buttons for completed orders */}
              {canRate(order) && (
                <View style={styles.ratingSection}>
                  {!order.hasProductRating && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon="star"
                      title="Ürünü Değerlendir"
                      onPress={() => setRatingModal({
                        visible: true,
                        type: 'product',
                        order,
                      })}
                      style={styles.rateButton}
                    />
                  )}
                  {!order.hasSellerRating && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon="person"
                      title="Satıcıyı Değerlendir"
                      onPress={() => setRatingModal({
                        visible: true,
                        type: 'seller',
                        order,
                      })}
                      style={styles.rateButton}
                    />
                  )}
                </View>
              )}
            </Card>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Rating Modal */}
      <RatingModal
        visible={ratingModal.visible}
        onDismiss={() => setRatingModal({ ...ratingModal, visible: false })}
        type={ratingModal.type}
        orderId={ratingModal.order?.id || ''}
        productId={ratingModal.order?.product.id}
        sellerId={ratingModal.order?.seller.id}
        productTitle={ratingModal.order?.product.title}
        sellerName={ratingModal.order?.seller.displayName}
        onSuccess={() => refetch()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.surface.DEFAULT,
  },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.white,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  filterContainer: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChipSpacing: {
    marginRight: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: colors.text.muted,
  },
  ordersList: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 8,
  },
  orderNumber: {
    color: colors.text.muted,
  },
  orderContent: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    color: colors.text.muted,
    marginTop: 4,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
    marginTop: 4,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    marginTop: 8,
    paddingTop: 8,
  },
  dateText: {
    color: colors.text.muted,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackButtonText: {
    color: colors.primary[600]!,
    marginLeft: 4,
    fontWeight: '500',
  },
  ratingSection: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
    gap: 8,
    flexWrap: 'wrap',
  },
  rateButton: {
    borderColor: colors.primary[600]!,
  },
});
