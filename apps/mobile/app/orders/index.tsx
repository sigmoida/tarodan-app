import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Chip, ActivityIndicator, Card, Button, Badge } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';
import RatingModal from '../../src/components/RatingModal';

interface Order {
  id: string;
  orderNumber: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded';
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
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

export default function OrdersScreen() {
  const { isAuthenticated } = useAuthStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
    order: Order | null;
  }>({ visible: false, type: 'product', order: null });

  // Fetch orders
  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['orders', 'buyer', filter],
    queryFn: async () => {
      try {
        const params: any = { role: 'buyer' };
        if (filter !== 'all') {
          params.status = filter;
        }
        const response = await api.get('/orders', { params });
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch orders');
        return [];
      }
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

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending': return TarodanColors.warning;
      case 'paid': return TarodanColors.info;
      case 'processing': return TarodanColors.info;
      case 'shipped': return TarodanColors.primary;
      case 'delivered': return TarodanColors.success;
      case 'completed': return TarodanColors.success;
      case 'cancelled': return TarodanColors.error;
      case 'refunded': return TarodanColors.textSecondary;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'Beklemede';
      case 'paid': return 'Ödendi';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal';
      case 'refunded': return 'İade';
      default: return status;
    }
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
        <Ionicons name="receipt-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Siparişlerim</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Siparişlerinizi görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Siparişlerim</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'pending', 'processing', 'shipped', 'delivered', 'completed'] as FilterType[]).map((f) => (
            <Chip
              key={f}
              selected={filter === f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipSelected]}
              textStyle={filter === f ? styles.filterChipTextSelected : styles.filterChipText}
            >
              {f === 'all' ? 'Tümü' : getStatusText(f as Order['status'])}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {/* Orders */}
      {isLoading && orders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            {filter === 'all' ? 'Henüz siparişiniz yok' : `${getStatusText(filter as Order['status'])} siparişiniz yok`}
          </Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            Alışverişe başlayın!
          </Text>
          <Button mode="contained" onPress={() => router.push('/(tabs)/search')}>
            Ürünleri Keşfet
          </Button>
        </View>
      ) : (
        <ScrollView
          style={styles.ordersList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          {filteredOrders.map((order) => (
            <Card key={order.id} style={styles.orderCard}>
              <TouchableOpacity onPress={() => router.push(`/orders/${order.id}`)}>
                <View style={styles.orderHeader}>
                  <Text variant="bodySmall" style={styles.orderNumber}>
                    Sipariş #{order.orderNumber}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                      {getStatusText(order.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderContent}>
                  <Image
                    source={{ uri: order.product.images?.[0]?.url || 'https://via.placeholder.com/80' }}
                    style={styles.productImage}
                  />
                  <View style={styles.productInfo}>
                    <Text variant="titleSmall" numberOfLines={2}>{order.product.title}</Text>
                    <Text variant="bodySmall" style={styles.sellerName}>
                      Satıcı: {order.seller.displayName}
                    </Text>
                    <Text variant="titleMedium" style={styles.price}>
                      {formatPrice(order.totalAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderFooter}>
                  <Text variant="bodySmall" style={styles.dateText}>
                    {formatDate(order.createdAt)}
                  </Text>

                  {/* Tracking */}
                  {order.trackingNumber && order.status === 'shipped' && (
                    <TouchableOpacity 
                      style={styles.trackButton}
                      onPress={() => router.push(`/order-track?orderNumber=${order.orderNumber}`)}
                    >
                      <Ionicons name="location" size={14} color={TarodanColors.primary} />
                      <Text style={styles.trackButtonText}>Takip Et</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>

              {/* Rating buttons for completed orders */}
              {canRate(order) && (
                <View style={styles.ratingSection}>
                  {!order.hasProductRating && (
                    <Button
                      mode="outlined"
                      compact
                      icon="star"
                      onPress={() => setRatingModal({
                        visible: true,
                        type: 'product',
                        order,
                      })}
                      style={styles.rateButton}
                    >
                      Ürünü Değerlendir
                    </Button>
                  )}
                  {!order.hasSellerRating && (
                    <Button
                      mode="outlined"
                      compact
                      icon="account-star"
                      onPress={() => setRatingModal({
                        visible: true,
                        type: 'seller',
                        order,
                      })}
                      style={styles.rateButton}
                    >
                      Satıcıyı Değerlendir
                    </Button>
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
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: TarodanColors.background,
  },
  header: {
    backgroundColor: TarodanColors.primary,
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
    color: TarodanColors.textOnPrimary,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  filterContainer: {
    backgroundColor: TarodanColors.background,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  filterChip: {
    marginRight: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipSelected: {
    backgroundColor: TarodanColors.primary,
  },
  filterChipText: {
    color: TarodanColors.textSecondary,
  },
  filterChipTextSelected: {
    color: TarodanColors.textOnPrimary,
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
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    color: TarodanColors.textSecondary,
  },
  ordersList: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 8,
  },
  orderNumber: {
    color: TarodanColors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  orderContent: {
    flexDirection: 'row',
    padding: 12,
    paddingTop: 0,
  },
  productImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  price: {
    color: TarodanColors.primary,
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
    borderTopColor: TarodanColors.border,
    marginTop: 8,
    paddingTop: 8,
  },
  dateText: {
    color: TarodanColors.textSecondary,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackButtonText: {
    color: TarodanColors.primary,
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
    borderColor: TarodanColors.primary,
  },
});
