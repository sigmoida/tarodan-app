import { View, ScrollView, StyleSheet, Pressable, Image, RefreshControl } from 'react-native';
import {
  Button,
  Chip,
  Spinner,
  Card,
  StatusBadge,
  Snackbar,
  Text,
  theme,
  ScreenHeader,
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
  isBuyer?: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  cancellationType?: 'iptal' | 'iade' | null;
  activeRefundRequest?: { id: string; status: string } | null;
}

/** Çok ürünlü sipariş grubu (tek checkout = tek kart, ürün başına ayrı kargo) */
interface OrderGroup {
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string; // UiOrderStatus | 'mixed'
  createdAt: string;
  orders: Order[];
}

type OrderListEntry =
  | { kind: 'order'; order: Order }
  | { kind: 'group'; group: OrderGroup };

type FilterType = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed';

// UI status keys -> StatusBadge config (matches semantic Badge variants)
const uiOrderStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  awaiting_confirmation: { label: 'Onayınız Bekleniyor', variant: 'warning' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal Edildi', variant: 'danger' },
  refunded: { label: 'İade Edildi', variant: 'secondary' },
  refund_requested: { label: 'İade Sürecinde', variant: 'danger' },
  mixed: { label: 'Karışık Durum', variant: 'info' },
};

const getStatusText = (status: UiOrderStatus) =>
  uiOrderStatusConfig[status]?.label ?? String(status);

// Rozet önceliği: aktif iade > iptal > normal durum.
// - activeRefundRequest dolu ama tamamlanmadıysa → "İade Sürecinde" (sipariş
//   'delivered' kalsa bile).
// - İade TAMAMLANDIYSA (status 'refunded') → "İade Edildi"; aksi halde biten iade
//   "İade Sürecinde" görünür (pickActiveRefundRequest biten talebi de döndürür).
// - cancellationType === 'iptal' → "İptal Edildi" (status 'refunded' olsa bile
//   "İade Edildi" DEME).
// - Aksi halde siparişin kendi UI durumu.
const badgeStatusOf = (o: any): string => {
  if (o?.activeRefundRequest) {
    return o.activeRefundRequest.status === 'refunded' ? 'refunded' : 'refund_requested';
  }
  if (o?.cancellationType === 'iptal') return 'cancelled';
  return o?.status;
};

// Kargo takip satırı: SADECE gerçek gönderi varken (trackingNumber dolu + kargo
// sonrası durum). İptal (cancellationType='iptal' / status cancelled) veya iade
// edilmiş siparişte gösterilmez; teslim öncesi placeholder kargo da gözükmez.
const showOrderTracking = (o: Order): boolean =>
  !!o.trackingNumber &&
  o.cancellationType !== 'iptal' &&
  ['shipped', 'delivered', 'awaiting_confirmation', 'completed'].includes(o.status);

export default function OrdersScreen() {
  const { isAuthenticated } = useAuthStore();
  // Bu ekran alıcı-only (Siparişlerim). Satıcı satışları /sales'te.
  const role: 'buyer' | 'seller' = 'buyer';
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  // Çok ürünlü grup accordion durumu — varsayılan KAPALI (boş Set)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
    order: Order | null;
  }>({ visible: false, type: 'product', order: null });
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; variant: 'success' | 'danger' | 'default' }>({
    visible: false,
    message: '',
    variant: 'default',
  });

  const normalizeOrder = (rawOrder: any): Order => ({
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
  });

  // Fetch orders.
  // Alıcı + "Tümü": gruplu liste (tek checkout = tek kart, çok ürün destekli).
  // Diğer filtreler ve satıcı sekmesi: düz sipariş listesi (durum filtreli).
  const useGroupedList = role === 'buyer' && filter === 'all';
  const { data: ordersData, isLoading, refetch, error: ordersError } = useQuery({
    queryKey: ['orders', role, filter],
    queryFn: async (): Promise<OrderListEntry[]> => {
      if (useGroupedList) {
        const response = await ordersApi.getGroups({ limit: 50, page: 1 });
        const raw = response.data?.data ?? response.data;
        const list = Array.isArray(raw) ? raw : [];
        return list.map((rawGroup: any): OrderListEntry => {
          const groupOrders: Order[] = (rawGroup.orders || []).map(normalizeOrder);
          // Tek ürünlü grup → klasik sipariş kartı (mevcut UX korunur)
          if (groupOrders.length === 1) {
            return { kind: 'order', order: groupOrders[0] };
          }
          return {
            kind: 'group',
            group: {
              id: rawGroup.id,
              groupNumber: rawGroup.groupNumber,
              totalAmount: Number(rawGroup.totalAmount ?? 0),
              status:
                rawGroup.status === 'mixed' ? 'mixed' : apiStatusToUi(rawGroup.status),
              createdAt: rawGroup.createdAt,
              orders: groupOrders,
            },
          };
        });
      }

      const params: Record<string, string | number> = { role, limit: 100, page: 1 };
      const apiStatus = uiFilterToApiStatusParam(filter);
      if (apiStatus) params.status = apiStatus;

      const response = await ordersApi.getAll(params);
      const raw = response.data?.data ?? response.data;
      const list = Array.isArray(raw) ? raw : [];

      let normalized: Order[] = list.map(normalizeOrder);
      if (filter === 'processing') {
        normalized = normalized.filter((o) => o.status === 'processing');
      }
      return normalized.map((order): OrderListEntry => ({ kind: 'order', order }));
    },
    enabled: isAuthenticated,
  });

  const entries: OrderListEntry[] = ordersData || [];

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
    // Yalnızca alıcı, teslim alınmış/tamamlanmış siparişi değerlendirebilir
    return order.isBuyer === true && ['delivered', 'completed'].includes(order.status);
  };

  const renderOrderCard = (order: Order, compact = false) => (
    <Card key={order.id} variant="elevated" padding={0} style={styles.orderCard}>
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

      {/* Değerlendirme — teslim/tamamlanmış siparişte (yeni escrow: ayrı "Teslim Aldım"
          onay butonu yok; satıcıya ödeme teslim+14 gün sonra otomatik serbest kalır) */}
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
  );

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="receipt-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>Siparişlerim</Text>
        <Text style={styles.subtitle}>
          Siparişlerinizi görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Siparişlerim" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {/* Bu ekran yalnız ALICI siparişlerini gösterir. Satışlar (satıcı görünümü)
          tam özellikli /sales ekranındadır (Profil → Satışlarım, Satıcı Paneli).
          Eski Aldıklarım/Sattıklarım toggle'ı /sales ile mükerrerdi, kaldırıldı. */}

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
          <Button variant="primary" title="Yenile" onPress={() => refetch()} style={StyleSheet.flatten([styles.emptyButton, { marginTop: 12 }])} />
        </View>
      ) : isLoading && entries.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>
            {filter === 'all' ? 'Henüz siparişiniz yok' : `${getStatusText(filter as UiOrderStatus)} siparişiniz yok`}
          </Text>
          <Text style={styles.emptySubtitle}>
            Alışverişe başlayın!
          </Text>
          <Button
            variant="primary"
            title="Ürünleri Keşfet"
            onPress={() => router.push('/(tabs)/search')}
            style={styles.emptyButton}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.ordersList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {entries.map((entry) => {
            if (entry.kind === 'order') {
              return renderOrderCard(entry.order);
            }

            const group = entry.group;
            const isExpanded = expandedGroups.has(group.id);
            const itemCount = group.orders.length;
            const thumbs = group.orders.slice(0, 4);
            const extraCount = itemCount - thumbs.length;

            return (
              <View key={group.id}>
                {/* Özet kart — tekli sipariş kartıyla AYNI krom; kapalıyken de tek karta benzer. */}
                <Card variant="elevated" padding={0} style={styles.orderCard}>
                {/* Özet satırı — tıkla aç/kapa (accordion) */}
                <Pressable
                  onPress={() => toggleGroup(group.id)}
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
                        {formatDate(group.createdAt)}
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
                        {formatPrice(group.totalAmount)}
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
                    {group.orders.map((order) => renderOrderCard(order, true))}
                  </View>
                )}
              </View>
            );
          })}

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
        onSuccess={() => {
          refetch();
          setSnackbar({
            visible: true,
            variant: 'success',
            message: 'Değerlendirmeniz alındı. Onaylandıktan sonra yayınlanacak.',
          });
        }}
      />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '', variant: 'default' })}
        duration={3500}
        variant={snackbar.variant}
      >
        {snackbar.message}
      </Snackbar>
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
  emptyButton: {
    alignSelf: 'center',
    paddingHorizontal: 32,
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
  productImageSm: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  groupItemsBand: {
    marginLeft: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary[300]!,
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
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
    borderWidth: 2,
    borderColor: colors.surface.DEFAULT,
  },
  thumbOverlap: {
    marginLeft: -18,
  },
  thumbMore: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.alt,
  },
  thumbMoreText: {
    color: colors.text.muted,
    fontWeight: '700',
  },
  groupFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateButton: {
    borderColor: colors.primary[600]!,
  },
});
