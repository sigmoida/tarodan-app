import { View, ScrollView, StyleSheet, Pressable, Image, RefreshControl } from 'react-native';
import {
  Button,
  Card,
  Spinner,
  StatusBadge,
  Text,
  theme,
  ScreenHeader,
} from '@tarodan/ui-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import type { BadgeVariant } from '@tarodan/ui-native';
import { ordersApi } from '../../../src/services/api';
import { apiStatusToUi, type UiOrderStatus } from '../../../src/utils/orderStatus';
import { getOrderProductImageUri } from '../../../src/utils/orderProductImage';
import { formatPrice } from '../../../src/utils/format';

const { colors, radius } = theme;

const uiOrderStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi', variant: 'info' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  awaiting_confirmation: { label: 'Onayınız Bekleniyor', variant: 'warning' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
  refunded: { label: 'İade', variant: 'secondary' },
  mixed: { label: 'Karışık Durum', variant: 'info' },
};

interface GroupOrder {
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
  seller: { id: string; displayName: string };
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  shipment?: {
    provider?: string;
    trackingNumber?: string | null;
    status?: string;
  } | null;
}

interface GroupDetail {
  id: string;
  groupNumber: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  payment?: { status: string; amount: number } | null;
  orders: GroupOrder[];
}

/**
 * Sipariş grubu detayı: tek checkout'ta alınan tüm ürünler tek "sipariş" olarak
 * gösterilir; her ürün satırının KENDİ kargo takibi vardır. Satıra dokununca
 * mevcut sipariş detayına (orders/[id]: kargo eventleri, iptal, iade) gidilir.
 */
export default function OrderGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: group, isLoading, refetch, error } = useQuery({
    queryKey: ['order-group', id],
    queryFn: async (): Promise<GroupDetail> => {
      const response = await ordersApi.getGroup(id!);
      const raw: any = response.data?.data ?? response.data;
      return {
        id: raw.id,
        groupNumber: raw.groupNumber,
        totalAmount: Number(raw.totalAmount ?? 0),
        status: raw.status === 'mixed' ? 'mixed' : apiStatusToUi(raw.status),
        createdAt: raw.createdAt,
        payment: raw.payment ?? null,
        orders: (raw.orders || []).map((o: any): GroupOrder => ({
          ...o,
          status: apiStatusToUi(o.status),
          totalAmount: Number(o.totalAmount ?? o.amount ?? 0),
          product: {
            ...(o.product || {}),
            id: o.product?.id ?? '',
            title: o.product?.title ?? '',
          },
        })),
      };
    },
    enabled: !!id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <View style={styles.container}>
      <ScreenHeader title="Sipariş Detayı" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {isLoading ? (
        <View style={styles.center}>
          <Spinner size="lg" />
        </View>
      ) : error || !group ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.subtle} />
          <Text style={styles.errorText}>Sipariş grubu yüklenemedi.</Text>
          <Button variant="primary" title="Tekrar Dene" onPress={() => refetch()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {/* Grup başlığı */}
          <Card variant="elevated" padding={12} style={styles.card}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text variant="label">{group.groupNumber}</Text>
                <Text variant="caption" style={styles.muted}>
                  {formatDate(group.createdAt)} · {group.orders.length} ürün
                </Text>
              </View>
              <StatusBadge status={group.status} config={uiOrderStatusConfig} size="sm" />
            </View>
            <View style={[styles.headerRow, styles.totalRow]}>
              <Text variant="label">Toplam</Text>
              <Text variant="label" style={styles.price}>{formatPrice(group.totalAmount)}</Text>
            </View>
          </Card>

          {/* Ürün satırları — her birinin kendi kargo takibi var */}
          {group.orders.map((order) => {
            const tracking = order.trackingNumber || order.shipment?.trackingNumber;
            return (
              <Card key={order.id} variant="elevated" padding={0} style={styles.card}>
                <Pressable onPress={() => router.push(`/orders/${order.id}` as any)}>
                  <View style={styles.itemHeader}>
                    <Text variant="caption" style={styles.muted}>#{order.orderNumber}</Text>
                    <StatusBadge status={order.status} config={uiOrderStatusConfig} size="sm" />
                  </View>
                  <View style={styles.itemContent}>
                    <Image
                      source={{ uri: getOrderProductImageUri(order.product) }}
                      style={styles.productImage}
                    />
                    <View style={styles.itemInfo}>
                      <Text variant="label" numberOfLines={2}>{order.product.title}</Text>
                      <Text variant="caption" style={styles.muted}>
                        Satıcı: {order.seller?.displayName}
                      </Text>
                      <Text variant="label" style={styles.price}>
                        {formatPrice(order.totalAmount)}
                      </Text>
                    </View>
                  </View>

                  {/* Bu ürünün kargo bilgisi */}
                  <View style={styles.shipmentRow}>
                    <Ionicons name="cube-outline" size={16} color={colors.primary[600]!} />
                    {tracking ? (
                      <Text variant="caption" style={styles.shipmentText}>
                        Kargo Takip: {tracking}
                      </Text>
                    ) : (
                      <Text variant="caption" style={styles.muted}>
                        Kargo bilgisi henüz oluşmadı
                      </Text>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={colors.text.subtle} />
                  </View>
                </Pressable>
              </Card>
            );
          })}

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.alt,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    color: colors.text.muted,
  },
  body: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.DEFAULT,
    marginTop: 10,
    paddingTop: 8,
  },
  muted: {
    color: colors.text.muted,
  },
  price: {
    color: colors.primary[600]!,
    fontWeight: 'bold',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 8,
  },
  itemContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  productImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  shipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface.alt,
  },
  shipmentText: {
    flex: 1,
    color: colors.text.heading,
    fontWeight: '600',
  },
});
