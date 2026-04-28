import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TarodanColors } from '../../src/theme/colors';
import { useAuthStore } from '../../src/stores/authStore';
import { ordersApi } from '../../src/services/api';
import { safeString } from '../../src/utils/safeString';

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
  buyer: {
    id: string;
    displayName: string;
    email?: string;
    avatarUrl?: string;
  };
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    district?: string;
    postalCode?: string;
  };
  billingAddress?: {
    fullName: string;
    address: string;
    city: string;
  };
  trackingNumber?: string;
  trackingUrl?: string;
  carrierName?: string;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuthStore();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  React.useEffect(() => {
    if (id && isAuthenticated) {
      fetchOrder();
    } else {
      setLoading(false);
    }
  }, [id, isAuthenticated]);

  const fetchOrder = async () => {
    try {
      const response = await ordersApi.getOne(id!);
      setOrder(response.data?.data || response.data);
    } catch (error) {
      console.log('Failed to fetch order detail');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    Alert.alert(
      'Siparişi Onayla',
      'Bu siparişi onaylamak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: async () => {
            setActionLoading(true);
            try {
              await ordersApi.confirm(id!);
              Alert.alert('Başarılı', 'Sipariş onaylandı');
              fetchOrder();
            } catch (error) {
              Alert.alert('Hata', 'Sipariş onaylanamadı');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price == null || isNaN(price)) return '₺0';
    return `₺${price.toLocaleString('tr-TR')}`;
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': case 'pending_payment': return TarodanColors.warning;
      case 'paid': return TarodanColors.info;
      case 'processing': return TarodanColors.info;
      case 'shipped': return TarodanColors.primary;
      case 'delivered': case 'completed': return TarodanColors.success;
      case 'cancelled': return TarodanColors.error;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': case 'pending_payment': return 'Ödeme Bekleniyor';
      case 'paid': return 'Ödendi';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal Edildi';
      default: return status;
    }
  };

  const getProductImage = () => {
    if (order?.product?.images && order.product.images.length > 0) {
      return { uri: order.product.images[0].url };
    }
    return { uri: 'https://via.placeholder.com/100' };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
            <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sipariş Detayı</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centeredContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={TarodanColors.error} />
          <Text style={styles.errorTitle}>Sipariş bulunamadı</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBackBtn}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sipariş Detayı</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.orderNumberText}>Sipariş #{order.orderNumber}</Text>
              <Text style={styles.orderDateText}>{formatDate(order.createdAt)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                {getStatusText(order.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        {order.status === 'pending_payment' && (
          <View style={styles.card}>
            <View style={styles.infoBanner}>
              <Ionicons name="time-outline" size={24} color={TarodanColors.warning} />
              <View style={styles.infoBannerContent}>
                <Text style={styles.infoBannerTitle}>Ödeme Bekleniyor</Text>
                <Text style={styles.infoBannerSubtitle}>Alıcının ödemeyi tamamlaması bekleniyor</Text>
              </View>
            </View>
          </View>
        )}

        {order.status === 'paid' && (
          <View style={styles.card}>
            <View style={styles.infoBanner}>
              <Ionicons name="checkmark-circle-outline" size={24} color={TarodanColors.info} />
              <View style={styles.infoBannerContent}>
                <Text style={styles.infoBannerTitle}>Ödeme Alındı</Text>
                <Text style={styles.infoBannerSubtitle}>Siparişi onaylayarak hazırlamaya başlayın</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.actionBtn, actionLoading && styles.actionBtnDisabled]}
              onPress={handleConfirm}
              disabled={actionLoading}
              activeOpacity={0.8}
            >
              {actionLoading ? (
                <ActivityIndicator color={TarodanColors.textOnPrimary} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={TarodanColors.textOnPrimary} />
                  <Text style={styles.actionBtnText}>Onayla</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {order.status === 'shipped' && order.trackingNumber && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Kargo Bilgileri</Text>
            <View style={styles.infoRow}>
              <Ionicons name="cube-outline" size={18} color={TarodanColors.textSecondary} />
              <Text style={styles.infoLabel}>Kargo Firması:</Text>
              <Text style={styles.infoValue}>{order.carrierName || 'Belirtilmemiş'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="barcode-outline" size={18} color={TarodanColors.textSecondary} />
              <Text style={styles.infoLabel}>Takip No:</Text>
              <Text style={[styles.infoValue, { color: TarodanColors.primary }]}>{order.trackingNumber}</Text>
            </View>
            {order.shippedAt && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={18} color={TarodanColors.textSecondary} />
                <Text style={styles.infoLabel}>Gönderim:</Text>
                <Text style={styles.infoValue}>{formatDate(order.shippedAt)}</Text>
              </View>
            )}
          </View>
        )}

        {order.status === 'completed' && (
          <View style={styles.card}>
            <View style={[styles.infoBanner, { backgroundColor: TarodanColors.successLight }]}>
              <Ionicons name="checkmark-done-circle" size={24} color={TarodanColors.success} />
              <View style={styles.infoBannerContent}>
                <Text style={[styles.infoBannerTitle, { color: TarodanColors.success }]}>Tamamlandı</Text>
                <Text style={styles.infoBannerSubtitle}>
                  {order.completedAt ? `Tamamlanma: ${formatDate(order.completedAt)}` : 'Sipariş başarıyla tamamlandı'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {order.status === 'cancelled' && (
          <View style={styles.card}>
            <View style={[styles.infoBanner, { backgroundColor: TarodanColors.errorLight }]}>
              <Ionicons name="close-circle" size={24} color={TarodanColors.error} />
              <View style={styles.infoBannerContent}>
                <Text style={[styles.infoBannerTitle, { color: TarodanColors.error }]}>İptal Edildi</Text>
                <Text style={styles.infoBannerSubtitle}>
                  {order.cancellationReason || 'Sipariş iptal edildi'}
                </Text>
                {order.cancelledAt && (
                  <Text style={styles.infoBannerSubtitle}>İptal tarihi: {formatDate(order.cancelledAt)}</Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Product Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ürün Bilgileri</Text>
          <TouchableOpacity
            style={styles.productRow}
            onPress={() => router.push(`/product/${order.product.id}`)}
          >
            <Image source={getProductImage()} style={styles.productImage} />
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>{order.product.title}</Text>
              <Text style={styles.productCondition}>Durum: {safeString(order.product?.condition)}</Text>
              <Text style={styles.productPrice}>{formatPrice(order.product.price)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={TarodanColors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Buyer Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alıcı Bilgileri</Text>
          <View style={styles.buyerRow}>
            <View style={styles.buyerAvatar}>
              <Ionicons name="person" size={24} color={TarodanColors.primary} />
            </View>
            <View style={styles.buyerInfo}>
              <Text style={styles.buyerName}>{order.buyer.displayName}</Text>
              {order.buyer.email && (
                <Text style={styles.buyerEmail}>{order.buyer.email}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Shipping Address */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Teslimat Adresi</Text>
          <View style={styles.addressContent}>
            <Ionicons name="location-outline" size={20} color={TarodanColors.primary} />
            <View style={styles.addressInfo}>
              <Text style={styles.addressName}>{order.shippingAddress.fullName}</Text>
              <Text style={styles.addressText}>{order.shippingAddress.address}</Text>
              <Text style={styles.addressText}>
                {order.shippingAddress.district ? `${order.shippingAddress.district}, ` : ''}
                {order.shippingAddress.city}
                {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ''}
              </Text>
              <Text style={styles.addressPhone}>Tel: {order.shippingAddress.phone}</Text>
            </View>
          </View>
        </View>

        {/* Price Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ödeme Özeti</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Ürün Tutarı</Text>
            <Text style={styles.priceValue}>{formatPrice(order.product.price)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Kargo</Text>
            <Text style={styles.priceValue}>{formatPrice(order.shippingCost)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{formatPrice(order.totalAmount)}</Text>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sipariş Geçmişi</Text>
          <TimelineStep
            icon="cart-outline"
            label="Sipariş Oluşturuldu"
            date={formatDate(order.createdAt)}
            active={true}
            isLast={!order.paidAt}
          />
          {order.paidAt && (
            <TimelineStep
              icon="card-outline"
              label="Ödeme Yapıldı"
              date={formatDate(order.paidAt)}
              active={true}
              isLast={!order.shippedAt}
            />
          )}
          {order.shippedAt && (
            <TimelineStep
              icon="airplane-outline"
              label="Kargoya Verildi"
              date={formatDate(order.shippedAt)}
              active={true}
              isLast={!order.deliveredAt}
            />
          )}
          {order.deliveredAt && (
            <TimelineStep
              icon="checkmark-circle-outline"
              label="Teslim Edildi"
              date={formatDate(order.deliveredAt)}
              active={true}
              isLast={!order.completedAt}
            />
          )}
          {order.completedAt && (
            <TimelineStep
              icon="checkmark-done-circle-outline"
              label="Tamamlandı"
              date={formatDate(order.completedAt)}
              active={true}
              isLast={true}
            />
          )}
          {order.cancelledAt && (
            <TimelineStep
              icon="close-circle-outline"
              label="İptal Edildi"
              date={formatDate(order.cancelledAt)}
              active={true}
              isLast={true}
              color={TarodanColors.error}
            />
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TimelineStep({
  icon,
  label,
  date,
  active,
  isLast = false,
  color,
}: {
  icon: string;
  label: string;
  date: string;
  active: boolean;
  isLast?: boolean;
  color?: string;
}) {
  const dotColor = color || (active ? TarodanColors.primary : TarodanColors.borderDark);

  return (
    <View style={timelineStyles.row}>
      <View style={timelineStyles.iconCol}>
        <View style={[timelineStyles.dot, { backgroundColor: dotColor }]}>
          <Ionicons name={icon as any} size={14} color={TarodanColors.textOnPrimary} />
        </View>
        {!isLast && <View style={[timelineStyles.line, { backgroundColor: active ? dotColor : TarodanColors.borderLight }]} />}
      </View>
      <View style={timelineStyles.content}>
        <Text style={[timelineStyles.label, { color: color || TarodanColors.textPrimary }]}>{label}</Text>
        <Text style={timelineStyles.date}>{date}</Text>
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  iconCol: {
    alignItems: 'center',
    width: 28,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  line: {
    width: 2,
    height: 28,
    marginVertical: 2,
  },
  content: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
});

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
  },
  header: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: TarodanColors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  orderDateText: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.warningLight,
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  infoBannerContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  infoBannerSubtitle: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  actionBtn: {
    backgroundColor: TarodanColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    flex: 1,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  productCondition: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
    marginTop: 4,
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buyerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: TarodanColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buyerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  buyerName: {
    fontSize: 15,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  buyerEmail: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  addressContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressInfo: {
    flex: 1,
    marginLeft: 10,
  },
  addressName: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 20,
  },
  addressPhone: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  priceValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: TarodanColors.border,
    marginVertical: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: TarodanColors.primary,
  },
  errorTitle: {
    fontSize: 16,
    color: TarodanColors.textPrimary,
    marginTop: 16,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: TarodanColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: TarodanColors.textOnPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
