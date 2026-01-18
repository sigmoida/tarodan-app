import { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, TextInput, Button, Divider, ActivityIndicator, Card } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TarodanColors } from '../src/theme';
import { api } from '../src/services/api';

interface OrderStatus {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  shippingCost: number;
  createdAt: string;
  product: {
    title: string;
    images: string[];
  };
  shipment?: {
    trackingNumber: string;
    carrier: string;
    status: string;
    estimatedDelivery?: string;
  };
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  pending_payment: { label: 'Ödeme Bekleniyor', color: '#FFC107', icon: 'time-outline' },
  paid: { label: 'Ödeme Alındı', color: '#4CAF50', icon: 'checkmark-circle-outline' },
  preparing: { label: 'Hazırlanıyor', color: '#2196F3', icon: 'construct-outline' },
  shipped: { label: 'Kargoya Verildi', color: '#9C27B0', icon: 'car-outline' },
  delivered: { label: 'Teslim Edildi', color: '#4CAF50', icon: 'checkmark-done-outline' },
  completed: { label: 'Tamamlandı', color: '#4CAF50', icon: 'trophy-outline' },
  cancelled: { label: 'İptal Edildi', color: '#F44336', icon: 'close-circle-outline' },
  refunded: { label: 'İade Edildi', color: '#FF9800', icon: 'return-down-back-outline' },
};

export default function OrderTrackScreen() {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderStatus | null>(null);

  const handleTrack = async () => {
    if (!orderNumber.trim()) {
      setError('Sipariş numarası girin');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Geçerli bir e-posta adresi girin');
      return;
    }

    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const response = await api.post('/orders/guest/track', {
        orderNumber: orderNumber.trim(),
        email: email.trim().toLowerCase(),
      });

      setOrder(response.data);
    } catch (err: any) {
      console.error('Track order error:', err);
      if (err.response?.status === 404) {
        setError('Sipariş bulunamadı. Bilgileri kontrol edin.');
      } else {
        setError(err.response?.data?.message || 'Sipariş sorgulanamadı');
      }
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    return STATUS_MAP[status] || { label: status, color: '#757575', icon: 'help-circle-outline' };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sipariş Takip</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Track Form */}
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <Ionicons name="search-outline" size={24} color={TarodanColors.primary} />
            <Text style={styles.formTitle}>Siparişinizi Sorgulayın</Text>
          </View>

          <Text style={styles.formDescription}>
            Sipariş numaranız ve e-posta adresinizle siparişinizin durumunu öğrenebilirsiniz.
          </Text>

          <TextInput
            label="Sipariş Numarası"
            value={orderNumber}
            onChangeText={(text) => {
              setOrderNumber(text);
              setError('');
            }}
            mode="outlined"
            style={styles.input}
            placeholder="ORD-XXXXXX"
            autoCapitalize="characters"
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />

          <TextInput
            label="E-posta Adresi"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError('');
            }}
            mode="outlined"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="ornek@email.com"
            outlineColor={TarodanColors.border}
            activeOutlineColor={TarodanColors.primary}
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={20} color={TarodanColors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            onPress={handleTrack}
            loading={loading}
            disabled={loading}
            style={styles.trackButton}
            icon="magnify"
          >
            Sipariş Sorgula
          </Button>
        </View>

        {/* Order Result */}
        {order && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <View>
                <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(order.status).color }]}>
                <Ionicons 
                  name={getStatusInfo(order.status).icon as any} 
                  size={16} 
                  color="#fff" 
                />
                <Text style={styles.statusText}>{getStatusInfo(order.status).label}</Text>
              </View>
            </View>

            <Divider style={{ marginVertical: 16 }} />

            {/* Product Info */}
            <View style={styles.productSection}>
              <Text style={styles.sectionTitle}>Ürün</Text>
              <Text style={styles.productTitle}>{order.product.title}</Text>
            </View>

            {/* Price Info */}
            <View style={styles.priceSection}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Ürün Tutarı</Text>
                <Text style={styles.priceValue}>
                  ₺{(order.totalAmount - order.shippingCost).toLocaleString('tr-TR')}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Kargo</Text>
                <Text style={styles.priceValue}>₺{order.shippingCost.toLocaleString('tr-TR')}</Text>
              </View>
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.priceRow}>
                <Text style={styles.totalLabel}>Toplam</Text>
                <Text style={styles.totalValue}>₺{order.totalAmount.toLocaleString('tr-TR')}</Text>
              </View>
            </View>

            {/* Shipping Info */}
            {order.shipment && (
              <View style={styles.shippingSection}>
                <Text style={styles.sectionTitle}>Kargo Bilgileri</Text>
                <View style={styles.shippingInfo}>
                  <View style={styles.shippingRow}>
                    <Text style={styles.shippingLabel}>Kargo Firması</Text>
                    <Text style={styles.shippingValue}>
                      {order.shipment.carrier === 'aras' ? 'Aras Kargo' : 'Yurtiçi Kargo'}
                    </Text>
                  </View>
                  {order.shipment.trackingNumber && (
                    <View style={styles.shippingRow}>
                      <Text style={styles.shippingLabel}>Takip Numarası</Text>
                      <Text style={[styles.shippingValue, styles.trackingNumber]}>
                        {order.shipment.trackingNumber}
                      </Text>
                    </View>
                  )}
                  {order.shipment.estimatedDelivery && (
                    <View style={styles.shippingRow}>
                      <Text style={styles.shippingLabel}>Tahmini Teslimat</Text>
                      <Text style={styles.shippingValue}>
                        {formatDate(order.shipment.estimatedDelivery)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Timeline */}
            <View style={styles.timelineSection}>
              <Text style={styles.sectionTitle}>Sipariş Durumu</Text>
              <View style={styles.timeline}>
                {['pending_payment', 'paid', 'preparing', 'shipped', 'delivered'].map((status, index) => {
                  const statusInfo = getStatusInfo(status);
                  const isActive = getStatusSteps(order.status) >= index;
                  const isCurrent = order.status === status;
                  
                  return (
                    <View key={status} style={styles.timelineItem}>
                      <View style={[
                        styles.timelineDot,
                        isActive && { backgroundColor: TarodanColors.primary },
                        isCurrent && styles.timelineDotCurrent,
                      ]}>
                        {isActive && (
                          <Ionicons 
                            name={isCurrent ? statusInfo.icon as any : 'checkmark'} 
                            size={12} 
                            color="#fff" 
                          />
                        )}
                      </View>
                      {index < 4 && (
                        <View style={[
                          styles.timelineLine,
                          isActive && { backgroundColor: TarodanColors.primary },
                        ]} />
                      )}
                      <Text style={[
                        styles.timelineLabel,
                        isActive && styles.timelineLabelActive,
                        isCurrent && styles.timelineLabelCurrent,
                      ]}>
                        {statusInfo.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Ionicons name="help-circle-outline" size={24} color={TarodanColors.primary} />
          <View style={styles.helpContent}>
            <Text style={styles.helpTitle}>Yardım mı gerekiyor?</Text>
            <Text style={styles.helpText}>
              Siparişinizle ilgili sorunuz varsa destek ekibimizle iletişime geçebilirsiniz.
            </Text>
            <TouchableOpacity 
              style={styles.helpButton}
              onPress={() => router.push('/help')}
            >
              <Text style={styles.helpButtonText}>Destek Al</Text>
              <Ionicons name="arrow-forward" size={16} color={TarodanColors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function getStatusSteps(status: string): number {
  const steps: Record<string, number> = {
    pending_payment: 0,
    paid: 1,
    preparing: 2,
    shipped: 3,
    delivered: 4,
    completed: 4,
  };
  return steps[status] ?? 0;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
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
  formCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginLeft: 12,
  },
  formDescription: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: TarodanColors.error,
    marginLeft: 8,
  },
  trackButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  resultCard: {
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  orderDate: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  productSection: {
    marginBottom: 16,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
  },
  priceSection: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  priceValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  shippingSection: {
    marginBottom: 16,
  },
  shippingInfo: {
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
    padding: 12,
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  shippingLabel: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  shippingValue: {
    fontSize: 14,
    color: TarodanColors.textPrimary,
    fontWeight: '500',
  },
  trackingNumber: {
    color: TarodanColors.primary,
    fontFamily: 'monospace',
  },
  timelineSection: {
    marginTop: 8,
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  timelineItem: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: TarodanColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: TarodanColors.primaryLight,
  },
  timelineLine: {
    position: 'absolute',
    top: 11,
    right: -20,
    width: 40,
    height: 2,
    backgroundColor: TarodanColors.border,
  },
  timelineLabel: {
    fontSize: 10,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  timelineLabelActive: {
    color: TarodanColors.textPrimary,
  },
  timelineLabelCurrent: {
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  helpSection: {
    flexDirection: 'row',
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 16,
  },
  helpContent: {
    flex: 1,
    marginLeft: 12,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  helpText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.primary,
    marginRight: 4,
  },
});
