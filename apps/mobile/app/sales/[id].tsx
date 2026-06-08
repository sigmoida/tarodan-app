import React from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Linking, Pressable } from 'react-native';
import {
  Button,
  Divider,
  ScreenLoader,
  ErrorState,
  Text,
  theme,
} from '@tarodan/ui-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../src/services/api';
import { ScreenHeader, ThemedRefreshControl } from '../../src/components/common';
import { useRefresh } from '../../src/hooks/useRefresh';
import { formatPrice, formatOrderStatus, formatRelativeDate } from '../../src/utils/format';
import { transformImageUrl } from '../../src/utils/imageUrl';

const { colors } = theme;

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  totalAmount?: number;
  subtotal?: number;
  shippingCost?: number;
  commission?: number;
  netAmount?: number;
  createdAt: string;
  buyer?: {
    id: string;
    displayName: string;
    email?: string;
    phone?: string;
  };
  shippingAddress?: {
    fullName: string;
    phone: string;
    city: string;
    district: string;
    address: string;
    zipCode?: string;
  };
  pricing?: {
    subtotal?: number;
    shippingAmount?: number;
    commissionAmount?: number;
    sellerNetAmount?: number;
    totalAmount?: number;
  };
  items?: Array<{
    id: string;
    price: number;
    quantity: number;
    product?: {
      id: string;
      title: string;
      imageUrl?: string;
    };
  }>;
  shipment?: {
    carrier?: string;
    provider?: string;
    trackingNumber?: string;
    status?: string;
    shippedAt?: string;
    trackingUrl?: string;
  };
}

function statusColor(status: string): { bg: string; fg: string } {
  if (['paid', 'preparing'].includes(status)) return { bg: colors.warning[50]!, fg: colors.warning[600]! };
  if (['shipped', 'in_transit', 'out_for_delivery'].includes(status))
    return { bg: colors.info[50]!, fg: colors.info[600]! };
  if (['delivered', 'completed'].includes(status))
    return { bg: colors.success[50]!, fg: colors.success[600]! };
  if (['cancelled', 'refunded'].includes(status))
    return { bg: colors.danger[50]!, fg: colors.danger[600]! };
  return { bg: colors.surface.alt, fg: colors.text.muted };
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useQuery<Order | null>({
    queryKey: ['sale-order', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await ordersApi.getOne(id);
      return response.data?.data ?? response.data ?? null;
    },
    enabled: !!id,
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  /**
   * Backend ödeme başarısı sonrasında siparişe Sürat Kargo gönderisini OTOMATIK
   * yaratır (payment.service.ts → auto-create shipment, provider='surat',
   * trackingNumber=orderNumber). Mobil tarafta artık satıcıdan kargo firması
   * ya da takip numarası istemiyoruz; sadece okuma-amaçlı gösteriyoruz.
   */
  const cancelMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.cancel(id!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-order', id] });
      Alert.alert('Bilgi', 'Sipariş iptal edildi.');
      router.back();
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || 'İşlem başarısız.'),
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Sipariş Detayı" />
        <ScreenLoader />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="Sipariş Detayı" />
        <ErrorState fullscreen onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  const sc = statusColor(order.status);
  const canCancel = ['paid', 'preparing'].includes(order.status);
  const shipmentTracking = order.shipment?.trackingNumber;
  const shipmentProvider = order.shipment?.provider ?? order.shipment?.carrier;
  const isSurat = (shipmentProvider ?? '').toLowerCase() === 'surat';

  const handleCall = () => {
    if (order.buyer?.phone) {
      Linking.openURL(`tel:${order.buyer.phone}`);
    }
  };

  const handleTrack = () => {
    if (!shipmentTracking) return;
    Linking.openURL(
      `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(shipmentTracking)}`,
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={`Sipariş ${order.orderNumber ? '#' + order.orderNumber : ''}`.trim()} />

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Status */}
        <View style={[styles.statusBanner, { backgroundColor: sc.bg }]}>
          <Ionicons name="information-circle" size={20} color={sc.fg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: sc.fg }]}>
              {formatOrderStatus(order.status)}
            </Text>
            <Text style={[styles.statusSub, { color: sc.fg }]}>
              {formatRelativeDate(order.createdAt)}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ürünler</Text>
          {(order.items || []).map(item => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [styles.itemRow, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.push(`/product/${item.product?.id}`)}
            >
              <Image source={{ uri: transformImageUrl(item.product?.imageUrl) }} style={styles.itemImg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.product?.title}</Text>
                <Text style={styles.itemMeta}>Adet: {item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Buyer */}
        {order.buyer ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Alıcı</Text>
            <View style={styles.kvRow}>
              <Ionicons name="person-outline" size={16} color={colors.text.muted} />
              <Text style={styles.kvValue}>{order.buyer.displayName}</Text>
            </View>
            {order.buyer.phone ? (
              <Pressable style={styles.kvRow} onPress={handleCall}>
                <Ionicons name="call-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.kvValue, { color: colors.primary[600]! }]}>
                  {order.buyer.phone}
                </Text>
              </Pressable>
            ) : null}
            {order.buyer.email ? (
              <View style={styles.kvRow}>
                <Ionicons name="mail-outline" size={16} color={colors.text.muted} />
                <Text style={styles.kvValue}>{order.buyer.email}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Shipping Address */}
        {order.shippingAddress ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Teslimat Adresi</Text>
            <Text style={styles.addressName}>{order.shippingAddress.fullName}</Text>
            <Text style={styles.addressLine}>{order.shippingAddress.address}</Text>
            <Text style={styles.addressLine}>
              {order.shippingAddress.district}, {order.shippingAddress.city}
              {order.shippingAddress.zipCode ? ` ${order.shippingAddress.zipCode}` : ''}
            </Text>
            <Text style={styles.addressLine}>Tel: {order.shippingAddress.phone}</Text>
          </View>
        ) : null}

        {/* Shipment — Sürat Kargo otomatik gönderi (auto-created, read-only) */}
        <View style={styles.card} testID="sales-shipment-card">
          <Text style={styles.sectionTitle}>Kargo Bilgisi (Sürat Kargo)</Text>
          {shipmentTracking ? (
            <>
              <View style={styles.kvRow}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color={colors.primary[600]!} />
                <Text style={styles.kvValue}>
                  {isSurat ? 'Sürat Kargo' : (shipmentProvider || 'Sürat Kargo')}
                </Text>
              </View>
              <View style={styles.kvRow}>
                <Ionicons name="barcode-outline" size={18} color={colors.text.muted} />
                <Text testID="sales-tracking-number" selectable style={[styles.kvValue, { fontWeight: '700' }]}>
                  {shipmentTracking}
                </Text>
              </View>
              {order.shipment?.status ? (
                <View style={styles.kvRow}>
                  <Ionicons name="pulse-outline" size={18} color={colors.text.muted} />
                  <Text testID="sales-shipment-status" style={styles.kvValue}>{order.shipment.status}</Text>
                </View>
              ) : null}
              <Text style={styles.helperText}>
                Sürat Kargo şubesinde bu takip numarasıyla ürünü teslim edin. Alıcıya bildirim otomatik gönderilir.
              </Text>
              <Button
                testID="sales-track-link"
                variant="outline"
                icon="cube"
                title="Sürat'ta Takip Et"
                onPress={handleTrack}
                style={{ marginTop: 8 }}
              />
            </>
          ) : (
            <Text style={styles.helperText}>
              Ödeme onaylandıktan sonra Sürat Kargo gönderiniz otomatik oluşturulur. Takip numarası kısa süre içinde burada görünecek.
            </Text>
          )}
        </View>

        {/* Totals */}
        {(() => {
          const p = order.pricing;
          const subtotal = p?.subtotal ?? order.subtotal;
          const shipping = p?.shippingAmount ?? order.shippingCost;
          const commission = p?.commissionAmount ?? order.commission;
          const net = p?.sellerNetAmount ?? order.netAmount;
          return (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Tutar Özeti</Text>
              {subtotal != null ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Ara Toplam</Text>
                  <Text style={styles.kvValue}>{formatPrice(subtotal)}</Text>
                </View>
              ) : null}
              {shipping != null ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Kargo</Text>
                  <Text style={styles.kvValue}>{formatPrice(shipping)}</Text>
                </View>
              ) : null}
              {commission != null ? (
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Komisyon</Text>
                  <Text style={[styles.kvValue, { color: colors.danger[600]! }]}>
                    - {formatPrice(commission)}
                  </Text>
                </View>
              ) : null}
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.kvRow}>
                <Text style={[styles.kvLabel, { fontWeight: '700' }]}>
                  {net != null ? 'Net Kazanç' : 'Toplam'}
                </Text>
                <Text style={[styles.kvValue, { fontSize: 18, fontWeight: '800', color: colors.primary[600]! }]}>
                  {formatPrice(net ?? order.totalAmount ?? 0)}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Actions */}
        {canCancel ? (
          <Button
            variant="outline"
            icon="close-circle-outline"
            title="Siparişi İptal Et"
            onPress={() =>
              Alert.alert(
                'Siparişi İptal Et',
                'Bu siparişi iptal etmek istediğinize emin misiniz? Alıcının ödemesi iade edilecek.',
                [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'İptal Et',
                    style: 'destructive',
                    onPress: () => cancelMutation.mutate('seller_cancelled'),
                  },
                ],
              )
            }
            style={{ ...styles.actionBtn, borderColor: colors.danger[600]! }}
            isLoading={cancelMutation.isPending}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  scrollBody: {
    padding: 16,
    gap: 12,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusSub: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.DEFAULT,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemImg: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  itemMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary[600]!,
    marginTop: 2,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  kvLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text.heading,
  },
  addressName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.heading,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  helperText: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 6,
    lineHeight: 17,
  },
  actionBtn: {
    borderRadius: 10,
    marginTop: 4,
  },
});
