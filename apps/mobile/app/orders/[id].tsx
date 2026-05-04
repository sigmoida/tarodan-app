import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Card, Button, ActivityIndicator, Divider, Chip, Modal, Portal, RadioButton, Snackbar } from 'react-native-paper';
import { Text, TextInput } from '../../src/components/common';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api, ordersApi, refundsApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import RatingModal from '../../src/components/RatingModal';
import { safeString } from '../../src/utils/safeString';
import { apiStatusToUi, type UiOrderStatus } from '../../src/utils/orderStatus';
import { getOrderProductImageUri } from '../../src/utils/orderProductImage';

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
    imageUrl?: string;
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
  isBuyer?: boolean;
  isSeller?: boolean;
  payment?: { status?: string } | null;
  activeRefundRequest?: {
    id: string;
    refundNumber?: string;
    status: string;
    reason?: string;
    createdAt: string;
    returnTrackingNumber?: string | null;
    returnProvider?: string | null;
  } | null;
}

const REFUND_REASONS: Array<{ value: string; label: string }> = [
  { value: 'damaged', label: 'Hasarlı geldi' },
  { value: 'not_as_described', label: 'Açıklamayla uyuşmuyor' },
  { value: 'wrong_item', label: 'Yanlış ürün geldi' },
  { value: 'missing_parts', label: 'Eksik parça var' },
  { value: 'changed_mind', label: 'Vazgeçtim' },
  { value: 'other', label: 'Diğer' },
];

const REFUND_STATUS_LABELS: Record<string, string> = {
  pending_review: 'Talep İnceleniyor',
  approved: 'Onaylandı, İşleniyor',
  wait_for_delivery: 'Ürün Tesliminden Sonra İade Açılacak',
  return_shipment_open: 'İade Kargonuz Hazır',
  return_in_transit: 'İade Yolda',
  return_delivered: 'Satıcıya Ulaştı, Para İadesi Yapılıyor',
  refunded: 'İade Tamamlandı',
  rejected: 'Talep Reddedildi',
  disputed: 'İtirazlı (İnceleniyor)',
  cancelled: 'İptal Edildi',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [ratingModal, setRatingModal] = useState<{
    visible: boolean;
    type: 'product' | 'seller';
  }>({ visible: false, type: 'product' });
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [refundReason, setRefundReason] = useState<string>('damaged');
  const [refundDescription, setRefundDescription] = useState('');
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  // Fetch order detail
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/orders/${id}`);
        const data = response.data?.data ?? response.data;
        if (!data) return null;
        return {
          ...data,
          status: apiStatusToUi(data.status),
          product: {
            ...(data.product || {}),
            imageUrl: data.product?.imageUrl,
          },
        };
      } catch (error) {
        console.log('Failed to fetch order');
        return null;
      }
    },
    enabled: !!id,
  });

  // Refund request mutation
  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: { reason: string; description?: string } = { reason: refundReason };
      const desc = refundDescription.trim();
      if (desc.length > 0) body.description = desc;
      return refundsApi.create(id as string, body);
    },
    onSuccess: () => {
      setRefundModalVisible(false);
      setRefundDescription('');
      setSnackbar({ visible: true, message: 'İade talebiniz oluşturuldu.' });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(', ')
          : 'İade talebi oluşturulamadı.');
      setSnackbar({ visible: true, message: typeof msg === 'string' ? msg : 'İade talebi oluşturulamadı.' });
    },
  });

  // Confirm delivery mutation
  const confirmDeliveryMutation = useMutation({
    mutationFn: async () => {
      return ordersApi.confirm(id as string);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const getStatusColor = (status: UiOrderStatus) => {
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

  const getStatusText = (status: UiOrderStatus) => {
    switch (status) {
      case 'pending': return 'Ödeme bekliyor';
      case 'paid': return 'Ödendi';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal Edildi';
      case 'refunded': return 'İade';
      default: return String(status);
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

  const formatPrice = (price: number | null | undefined) => {
    if (price == null || isNaN(price)) {
      return '₺0';
    }
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
                source={{ uri: getOrderProductImageUri(order.product) }}
                style={styles.productImage}
              />
              <View style={styles.productInfo}>
                <Text variant="titleSmall" numberOfLines={2}>{order.product.title}</Text>
                <Text variant="bodySmall" style={styles.conditionText}>
                  Durum: {safeString(order.product?.condition)}
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

        {/* Actions - Only buyer can confirm delivery */}
        {order.status === 'delivered' && order.isBuyer && (
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

        {/* Rating Buttons - Only buyer can rate product and seller */}
        {canRate && order.isBuyer && (
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

        {/* Refund — existing request banner */}
        {order.activeRefundRequest && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.refundHeaderRow}>
                <Ionicons name="return-up-back" size={20} color={TarodanColors.info} />
                <Text variant="titleSmall" style={styles.refundHeaderText}>
                  İade Talebi
                </Text>
                <Chip
                  compact
                  style={{
                    backgroundColor:
                      order.activeRefundRequest.status === 'refunded'
                        ? TarodanColors.success + '20'
                        : TarodanColors.info + '20',
                  }}
                  textStyle={{
                    color:
                      order.activeRefundRequest.status === 'refunded'
                        ? TarodanColors.success
                        : TarodanColors.info,
                  }}
                >
                  {REFUND_STATUS_LABELS[order.activeRefundRequest.status] ??
                    order.activeRefundRequest.status}
                </Chip>
              </View>
              {order.activeRefundRequest.refundNumber ? (
                <Text variant="bodySmall" style={styles.refundMeta}>
                  {order.activeRefundRequest.refundNumber} ·{' '}
                  {formatDate(order.activeRefundRequest.createdAt)}
                </Text>
              ) : null}
              {order.activeRefundRequest.status === 'return_shipment_open' &&
              order.activeRefundRequest.returnTrackingNumber ? (
                <View style={styles.refundTrackingBox}>
                  <Text variant="bodySmall" style={styles.refundTrackingHint}>
                    Bu numarayı paketle birlikte herhangi bir Sürat şubesine bırakın:
                  </Text>
                  <Text style={styles.refundTrackingNumber}>
                    {order.activeRefundRequest.returnTrackingNumber}
                  </Text>
                  {order.activeRefundRequest.returnProvider === 'surat' ? (
                    <Button
                      mode="outlined"
                      icon="truck"
                      onPress={() =>
                        Linking.openURL(
                          `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(
                            order.activeRefundRequest!.returnTrackingNumber!,
                          )}`,
                        )
                      }
                      style={{ marginTop: 8 }}
                    >
                      Sürat'ta Takip Et
                    </Button>
                  ) : null}
                </View>
              ) : null}
            </Card.Content>
          </Card>
        )}

        {/* Refund — request button (paid+ orders, buyer only, no active request) */}
        {order.isBuyer &&
          !order.activeRefundRequest &&
          order.payment?.status === 'completed' &&
          !['cancelled', 'refunded'].includes(order.status) && (
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleSmall" style={styles.sectionTitle}>
                  İade İşlemleri
                </Text>
                <Text variant="bodySmall" style={styles.refundIntro}>
                  Ödeme tamamlandı. Gerekirse iade işlemi başlatabilirsiniz.
                </Text>
                <Button
                  mode="outlined"
                  icon="undo-variant"
                  onPress={() => setRefundModalVisible(true)}
                  style={{ marginTop: 8 }}
                >
                  İade Talep Et
                </Button>
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

      {/* Refund Request Modal */}
      <Portal>
        <Modal
          visible={refundModalVisible}
          onDismiss={() => setRefundModalVisible(false)}
          contentContainerStyle={styles.refundModal}
        >
          <ScrollView>
            <Text variant="titleMedium" style={styles.refundModalTitle}>
              İade Talebi Oluştur
            </Text>
            <Text variant="bodySmall" style={styles.refundModalHint}>
              Lütfen iade nedeninizi seçin ve gerekiyorsa kısa bir açıklama ekleyin.
            </Text>

            <Text variant="bodySmall" style={styles.refundModalLabel}>
              İade Nedeni
            </Text>
            <RadioButton.Group onValueChange={setRefundReason} value={refundReason}>
              {REFUND_REASONS.map((r) => (
                <RadioButton.Item
                  key={r.value}
                  label={r.label}
                  value={r.value}
                  position="leading"
                  style={styles.refundRadio}
                />
              ))}
            </RadioButton.Group>

            <Text variant="bodySmall" style={styles.refundModalLabel}>
              Açıklama (isteğe bağlı)
            </Text>
            <TextInput
              mode="outlined"
              placeholder="Sorunu kısaca anlatın..."
              value={refundDescription}
              onChangeText={setRefundDescription}
              multiline
              numberOfLines={4}
              style={styles.refundDescription}
            />

            <View style={styles.refundModalActions}>
              <Button
                mode="text"
                onPress={() => setRefundModalVisible(false)}
                disabled={refundMutation.isPending}
              >
                Vazgeç
              </Button>
              <Button
                mode="contained"
                onPress={() => refundMutation.mutate()}
                loading={refundMutation.isPending}
                disabled={refundMutation.isPending}
              >
                Talebi Gönder
              </Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, message: '' })}
        duration={3500}
      >
        {snackbar.message}
      </Snackbar>

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
  refundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  refundHeaderText: {
    flex: 1,
    color: TarodanColors.textPrimary,
  },
  refundMeta: {
    color: TarodanColors.textSecondary,
    marginBottom: 6,
  },
  refundIntro: {
    color: TarodanColors.textSecondary,
  },
  refundTrackingBox: {
    backgroundColor: TarodanColors.backgroundSecondary,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  refundTrackingHint: {
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  refundTrackingNumber: {
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    fontSize: 16,
  },
  refundModal: {
    backgroundColor: TarodanColors.background,
    margin: 16,
    padding: 20,
    borderRadius: 12,
    maxHeight: '85%',
  },
  refundModalTitle: {
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 6,
  },
  refundModalHint: {
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  refundModalLabel: {
    color: TarodanColors.textPrimary,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  refundRadio: {
    paddingVertical: 2,
  },
  refundDescription: {
    backgroundColor: TarodanColors.background,
    minHeight: 80,
  },
  refundModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
