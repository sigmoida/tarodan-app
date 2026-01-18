import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Text, Card, Button, ActivityIndicator, Divider, Chip } from 'react-native-paper';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import RatingModal from '../../src/components/RatingModal';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  shippingCost: number;
  product: {
    id: string;
    title: string;
    price: number;
    condition: string;
    images?: Array<{ url: string }>;
  };
  seller: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
  };
  trackingNumber?: string;
  trackingUrl?: string;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
  }>({ visible: false, type: 'product' });

  // Fetch order detail
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/orders/${id}`);
        return response.data;
      } catch (error) {
        console.log('Failed to fetch order');
        return null;
      }
    },
    enabled: !!id,
  });

  // Confirm delivery mutation
  const confirmDeliveryMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/orders/${id}/confirm-delivery`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return TarodanColors.warning;
      case 'paid': return TarodanColors.info;
      case 'processing': return TarodanColors.info;
      case 'shipped': return TarodanColors.primary;
      case 'delivered': return TarodanColors.success;
      case 'completed': return TarodanColors.success;
      case 'cancelled': return TarodanColors.error;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ödeme Bekliyor';
      case 'paid': return 'Ödendi';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal Edildi';
      default: return status;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    return `₺${price.toLocaleString('tr-TR')}`;
  };

  const canRate = order && ['delivered', 'completed'].includes(order.status);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={TarodanColors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={TarodanColors.error} />
        <Text style={{ marginTop: 16 }}>Sipariş bulunamadı</Text>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 16 }}>
          Geri Dön
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sipariş Detayı</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Order Status */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.statusHeader}>
              <Text variant="bodySmall" style={styles.orderNumber}>
                Sipariş #{order.orderNumber}
              </Text>
              <Chip 
                style={{ backgroundColor: getStatusColor(order.status) + '20' }}
                textStyle={{ color: getStatusColor(order.status) }}
              >
                {getStatusText(order.status)}
              </Chip>
            </View>

            {/* Status Timeline */}
            <View style={styles.timeline}>
              <TimelineItem 
                icon="cart" 
                label="Sipariş Oluşturuldu"
                date={formatDate(order.createdAt)}
                isActive={true}
              />
              <TimelineItem 
                icon="card" 
                label="Ödeme Yapıldı"
                date={formatDate(order.paidAt)}
                isActive={!!order.paidAt}
              />
              <TimelineItem 
                icon="cube" 
                label="Kargoya Verildi"
                date={formatDate(order.shippedAt)}
                isActive={!!order.shippedAt}
              />
              <TimelineItem 
                icon="checkmark-circle" 
                label="Teslim Edildi"
                date={formatDate(order.deliveredAt)}
                isActive={!!order.deliveredAt}
                isLast
              />
            </View>
          </Card.Content>
        </Card>

        {/* Tracking Info */}
        {order.trackingNumber && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>Kargo Takip</Text>
              <View style={styles.trackingRow}>
                <Ionicons name="location" size={20} color={TarodanColors.primary} />
                <View style={styles.trackingInfo}>
                  <Text variant="bodyMedium">{order.trackingNumber}</Text>
                  {order.trackingUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(order.trackingUrl!)}>
                      <Text style={styles.trackLink}>Kargo Sitesinde Takip Et</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Product */}
        <Card style={styles.card}>
          <TouchableOpacity onPress={() => router.push(`/product/${order.product.id}`)}>
            <Card.Content style={styles.productCard}>
              <Image
                source={{ uri: order.product.images?.[0]?.url || 'https://via.placeholder.com/80' }}
                style={styles.productImage}
              />
              <View style={styles.productInfo}>
                <Text variant="titleSmall" numberOfLines={2}>{order.product.title}</Text>
                <Text variant="bodySmall" style={styles.conditionText}>
                  Durum: {order.product.condition}
                </Text>
                <Text variant="titleMedium" style={styles.productPrice}>
                  {formatPrice(order.product.price)}
                </Text>
              </View>
            </Card.Content>
          </TouchableOpacity>
        </Card>

        {/* Seller */}
        <Card style={styles.card}>
          <TouchableOpacity onPress={() => router.push(`/seller/${order.seller.id}`)}>
            <Card.Content style={styles.sellerCard}>
              <Ionicons name="storefront" size={24} color={TarodanColors.primary} />
              <View style={styles.sellerInfo}>
                <Text variant="titleSmall">{order.seller.displayName}</Text>
                <Text variant="bodySmall" style={styles.sellerLink}>Satıcı Profilini Görüntüle</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
            </Card.Content>
          </TouchableOpacity>
        </Card>

        {/* Shipping Address */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>Teslimat Adresi</Text>
            <Text variant="bodyMedium">{order.shippingAddress.fullName}</Text>
            <Text variant="bodySmall" style={styles.addressText}>
              {order.shippingAddress.address}
            </Text>
            <Text variant="bodySmall" style={styles.addressText}>
              {order.shippingAddress.city} {order.shippingAddress.postalCode}
            </Text>
            <Text variant="bodySmall" style={styles.addressText}>
              Tel: {order.shippingAddress.phone}
            </Text>
          </Card.Content>
        </Card>

        {/* Price Summary */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionTitle}>Ödeme Özeti</Text>
            <View style={styles.priceRow}>
              <Text variant="bodyMedium">Ürün Tutarı</Text>
              <Text variant="bodyMedium">{formatPrice(order.product.price)}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text variant="bodyMedium">Kargo</Text>
              <Text variant="bodyMedium">{formatPrice(order.shippingCost)}</Text>
            </View>
            <Divider style={{ marginVertical: 8 }} />
            <View style={styles.priceRow}>
              <Text variant="titleMedium">Toplam</Text>
              <Text variant="titleMedium" style={styles.totalPrice}>
                {formatPrice(order.totalAmount)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Actions */}
        {order.status === 'delivered' && (
          <Card style={styles.card}>
            <Card.Content>
              <Button
                mode="contained"
                onPress={() => confirmDeliveryMutation.mutate()}
                loading={confirmDeliveryMutation.isPending}
                style={{ marginBottom: 12 }}
              >
                Teslimatı Onayla
              </Button>
              <Text variant="bodySmall" style={styles.confirmNote}>
                Ürünü aldığınızı onaylayarak siparişi tamamlayın
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Rating Buttons */}
        {canRate && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionTitle}>Değerlendirme</Text>
              <View style={styles.ratingButtons}>
                {!order.hasProductRating && (
                  <Button
                    mode="outlined"
                    icon="star"
                    onPress={() => setRatingModal({ visible: true, type: 'product' })}
                    style={styles.rateButton}
                  >
                    Ürünü Değerlendir
                  </Button>
                )}
                {!order.hasSellerRating && (
                  <Button
                    mode="outlined"
                    icon="account-star"
                    onPress={() => setRatingModal({ visible: true, type: 'seller' })}
                    style={styles.rateButton}
                  >
                    Satıcıyı Değerlendir
                  </Button>
                )}
                {order.hasProductRating && order.hasSellerRating && (
                  <View style={styles.ratedMessage}>
                    <Ionicons name="checkmark-circle" size={20} color={TarodanColors.success} />
                    <Text style={styles.ratedText}>Değerlendirmeniz alındı</Text>
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Help */}
        <Card style={styles.card}>
          <TouchableOpacity onPress={() => router.push('/help')}>
            <Card.Content style={styles.helpCard}>
              <Ionicons name="help-circle" size={24} color={TarodanColors.primary} />
              <Text variant="bodyMedium" style={{ flex: 1, marginLeft: 12 }}>
                Yardıma mı ihtiyacınız var?
              </Text>
              <Ionicons name="chevron-forward" size={20} color={TarodanColors.textSecondary} />
            </Card.Content>
          </TouchableOpacity>
        </Card>

        <View style={{ height: 50 }} />
      </ScrollView>

      {/* Rating Modal */}
      <RatingModal
        visible={ratingModal.visible}
        onDismiss={() => setRatingModal({ ...ratingModal, visible: false })}
        type={ratingModal.type}
        orderId={order.id}
        productId={order.product.id}
        sellerId={order.seller.id}
        productTitle={order.product.title}
        sellerName={order.seller.displayName}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['order', id] })}
      />
    </View>
  );
}

// Timeline Item Component
function TimelineItem({ 
  icon, 
  label, 
  date, 
  isActive, 
  isLast = false 
}: { 
  icon: string; 
  label: string; 
  date: string; 
  isActive: boolean;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineIcon}>
        <View style={[
          styles.iconCircle, 
          isActive ? styles.iconCircleActive : styles.iconCircleInactive
        ]}>
          <Ionicons 
            name={icon as any} 
            size={16} 
            color={isActive ? TarodanColors.textOnPrimary : TarodanColors.textLight} 
          />
        </View>
        {!isLast && (
          <View style={[
            styles.timelineLine,
            isActive ? styles.timelineLineActive : styles.timelineLineInactive
          ]} />
        )}
      </View>
      <View style={styles.timelineContent}>
        <Text variant="bodyMedium" style={isActive ? styles.activeLabel : styles.inactiveLabel}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.timelineDate}>{date}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderNumber: {
    color: TarodanColors.textSecondary,
  },
  timeline: {
    marginTop: 8,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineIcon: {
    alignItems: 'center',
    width: 32,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleActive: {
    backgroundColor: TarodanColors.primary,
  },
  iconCircleInactive: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  timelineLine: {
    width: 2,
    height: 32,
    marginVertical: 4,
  },
  timelineLineActive: {
    backgroundColor: TarodanColors.primary,
  },
  timelineLineInactive: {
    backgroundColor: TarodanColors.surfaceVariant,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 24,
  },
  activeLabel: {
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  inactiveLabel: {
    color: TarodanColors.textLight,
  },
  timelineDate: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    marginBottom: 12,
    color: TarodanColors.textPrimary,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trackLink: {
    color: TarodanColors.primary,
    marginTop: 4,
  },
  productCard: {
    flexDirection: 'row',
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
  conditionText: {
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  productPrice: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
    marginTop: 4,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerLink: {
    color: TarodanColors.primary,
  },
  addressText: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalPrice: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  confirmNote: {
    textAlign: 'center',
    color: TarodanColors.textSecondary,
  },
  ratingButtons: {
    gap: 8,
  },
  rateButton: {
    borderColor: TarodanColors.primary,
  },
  ratedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  ratedText: {
    marginLeft: 8,
    color: TarodanColors.success,
  },
  helpCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
