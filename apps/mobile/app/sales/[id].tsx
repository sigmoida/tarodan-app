import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert, Linking, TouchableOpacity } from 'react-native';
import { Button, Portal, Dialog, SegmentedButtons, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, shippingApi } from '../../src/services/api';
import { TarodanColors } from '../../src/theme';
import { ScreenHeader, ScreenLoader, ErrorState, Text, TextInput } from '../../src/components/common';
import { formatPrice, formatOrderStatus, formatRelativeDate } from '../../src/utils/format';
import { transformImageUrl } from '../../src/utils/imageUrl';

/** Backend yalnızca aras / yurtici / mng kargo firmasını destekliyor (ShippingProvider enum). */
type CarrierKey = 'aras' | 'yurtici' | 'mng';

const CARRIERS: Array<{ key: CarrierKey; label: string }> = [
  { key: 'aras', label: 'Aras Kargo' },
  { key: 'yurtici', label: 'Yurtiçi' },
  { key: 'mng', label: 'MNG' },
];

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
  items?: Array<{
    id: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
    imageUrl?: string;
  }>;
  shipment?: {
    carrier?: string;
    trackingNumber?: string;
    status?: string;
    shippedAt?: string;
    trackingUrl?: string;
  };
}

function statusColor(status: string): { bg: string; fg: string } {
  if (['paid', 'preparing'].includes(status)) return { bg: TarodanColors.warningLight, fg: TarodanColors.warning };
  if (['shipped', 'in_transit', 'out_for_delivery'].includes(status))
    return { bg: TarodanColors.infoLight, fg: TarodanColors.info };
  if (['delivered', 'completed'].includes(status))
    return { bg: TarodanColors.successLight, fg: TarodanColors.success };
  if (['cancelled', 'refunded'].includes(status))
    return { bg: TarodanColors.errorLight, fg: TarodanColors.error };
  return { bg: TarodanColors.surfaceVariant, fg: TarodanColors.textSecondary };
}

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [shipDialog, setShipDialog] = useState(false);
  const [carrier, setCarrier] = useState<CarrierKey>('aras');
  const [trackingNumber, setTrackingNumber] = useState('');

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

  /**
   * Backend iki adımlı kargo akışı kullanıyor:
   *   1) POST /shipping        { orderId, provider }  → shipment yaratılır
   *   2) PATCH /shipping/:id/tracking { trackingNumber } → takip no eklenir
   * Bu mutasyon ikisini sırayla çalıştırır.
   */
  const shipMutation = useMutation({
    mutationFn: async () => {
      const created = await shippingApi.createShipment({
        orderId: id as string,
        provider: carrier,
      });
      const shipment = (created.data as any)?.data ?? (created.data as any);
      const shipmentId = shipment?.id;
      if (!shipmentId) {
        throw new Error('Kargo kaydı oluşturulamadı (id eksik).');
      }
      if (trackingNumber.trim()) {
        await shippingApi.updateTracking(shipmentId, {
          trackingNumber: trackingNumber.trim(),
        });
      }
      return { shipmentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-order', id] });
      queryClient.invalidateQueries({ queryKey: ['seller-pending-orders'] });
      setShipDialog(false);
      Alert.alert('Başarılı', 'Kargo bilgisi kaydedildi. Alıcıya bildirim gönderildi.');
    },
    onError: (e: any) =>
      Alert.alert('Hata', e?.response?.data?.message || e?.message || 'Kargo bilgisi kaydedilemedi.'),
  });

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
  const canShip = ['paid', 'preparing'].includes(order.status) && !order.shipment?.trackingNumber;
  const canCancel = ['paid', 'preparing'].includes(order.status);
  const hasShipment = !!order.shipment?.trackingNumber;

  const handleShipSubmit = () => {
    if (!trackingNumber.trim())
      return Alert.alert('Eksik', 'Kargo takip numarası gerekli.');
    shipMutation.mutate();
  };

  const handleCall = () => {
    if (order.buyer?.phone) {
      Linking.openURL(`tel:${order.buyer.phone}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title={`Sipariş ${order.orderNumber ? '#' + order.orderNumber : ''}`.trim()} />

      <ScrollView contentContainerStyle={styles.scrollBody}>
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
            <TouchableOpacity
              key={item.id}
              style={styles.itemRow}
              onPress={() => router.push(`/product/${item.productId}`)}
              activeOpacity={0.85}
            >
              <Image source={{ uri: transformImageUrl(item.imageUrl) }} style={styles.itemImg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.itemMeta}>Adet: {item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Buyer */}
        {order.buyer ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Alıcı</Text>
            <View style={styles.kvRow}>
              <Ionicons name="person-outline" size={16} color={TarodanColors.textSecondary} />
              <Text style={styles.kvValue}>{order.buyer.displayName}</Text>
            </View>
            {order.buyer.phone ? (
              <TouchableOpacity style={styles.kvRow} onPress={handleCall}>
                <Ionicons name="call-outline" size={16} color={TarodanColors.textSecondary} />
                <Text style={[styles.kvValue, { color: TarodanColors.primary }]}>
                  {order.buyer.phone}
                </Text>
              </TouchableOpacity>
            ) : null}
            {order.buyer.email ? (
              <View style={styles.kvRow}>
                <Ionicons name="mail-outline" size={16} color={TarodanColors.textSecondary} />
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

        {/* Shipment */}
        {hasShipment ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Kargo Bilgisi</Text>
            <View style={styles.kvRow}>
              <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={TarodanColors.textSecondary} />
              <Text style={styles.kvValue}>{order.shipment?.carrier}</Text>
            </View>
            <View style={styles.kvRow}>
              <Ionicons name="barcode-outline" size={18} color={TarodanColors.textSecondary} />
              <Text selectable style={[styles.kvValue, { fontWeight: '700' }]}>
                {order.shipment?.trackingNumber}
              </Text>
            </View>
            {order.shipment?.status ? (
              <View style={styles.kvRow}>
                <Ionicons name="pulse-outline" size={18} color={TarodanColors.textSecondary} />
                <Text style={styles.kvValue}>{order.shipment.status}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Totals */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tutar Özeti</Text>
          {order.subtotal ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Ara Toplam</Text>
              <Text style={styles.kvValue}>{formatPrice(order.subtotal)}</Text>
            </View>
          ) : null}
          {order.shippingCost != null ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Kargo</Text>
              <Text style={styles.kvValue}>{formatPrice(order.shippingCost)}</Text>
            </View>
          ) : null}
          {order.commission ? (
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Komisyon</Text>
              <Text style={[styles.kvValue, { color: TarodanColors.error }]}>
                - {formatPrice(order.commission)}
              </Text>
            </View>
          ) : null}
          <Divider style={{ marginVertical: 8 }} />
          <View style={styles.kvRow}>
            <Text style={[styles.kvLabel, { fontWeight: '700' }]}>
              {order.netAmount ? 'Net Kazanç' : 'Toplam'}
            </Text>
            <Text style={[styles.kvValue, { fontSize: 18, fontWeight: '800', color: TarodanColors.primary }]}>
              {formatPrice(order.netAmount ?? order.totalAmount ?? 0)}
            </Text>
          </View>
        </View>

        {/* Actions */}
        {canShip ? (
          <Button
            mode="contained"
            buttonColor={TarodanColors.primary}
            icon="truck-fast"
            onPress={() => setShipDialog(true)}
            style={styles.actionBtn}
            contentStyle={{ paddingVertical: 4 }}
          >
            Kargo Bilgisi Gir
          </Button>
        ) : null}

        {canCancel ? (
          <Button
            mode="outlined"
            textColor={TarodanColors.error}
            icon="close-circle-outline"
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
            style={[styles.actionBtn, { borderColor: TarodanColors.error }]}
            loading={cancelMutation.isPending}
          >
            Siparişi İptal Et
          </Button>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={shipDialog} onDismiss={() => setShipDialog(false)}>
          <Dialog.Title>Kargo Bilgisi</Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}>
              <Text style={{ marginBottom: 12, color: TarodanColors.textSecondary }}>
                Kargo firmasını seçip takip numarasını girin. Alıcıya anında bildirim gönderilecek.
              </Text>
              <SegmentedButtons
                value={carrier}
                onValueChange={v => setCarrier(v as CarrierKey)}
                density="small"
                buttons={CARRIERS.map(c => ({ value: c.key, label: c.label }))}
              />
              <TextInput
                mode="outlined"
                label="Takip Numarası"
                value={trackingNumber}
                onChangeText={setTrackingNumber}
                style={{ marginTop: 12, backgroundColor: TarodanColors.background }}
                outlineColor={TarodanColors.border}
                activeOutlineColor={TarodanColors.primary}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShipDialog(false)}>Vazgeç</Button>
            <Button
              mode="contained"
              buttonColor={TarodanColors.primary}
              onPress={handleShipSubmit}
              loading={shipMutation.isPending}
              disabled={shipMutation.isPending}
            >
              Kaydet
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TarodanColors.backgroundSecondary,
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
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TarodanColors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
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
    backgroundColor: TarodanColors.surfaceVariant,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  itemMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.primary,
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
    color: TarodanColors.textSecondary,
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    color: TarodanColors.textPrimary,
  },
  addressName: {
    fontSize: 14,
    fontWeight: '700',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  addressLine: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    lineHeight: 18,
  },
  actionBtn: {
    borderRadius: 10,
    marginTop: 4,
  },
});
