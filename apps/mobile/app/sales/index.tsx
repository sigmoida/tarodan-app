import { View, ScrollView, StyleSheet, Image, RefreshControl } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Spinner,
  Modal,
  Input,
  Text,
  StatusBadge,
  theme,
  ScreenHeader,
  appAlert,
} from '@tarodan/ui-native';
import type { BadgeVariant } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ordersApi, shippingApi } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { getOrderProductImageUri } from '../../src/utils/orderProductImage';

const { colors } = theme;

const salesStatusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Ödeme Bekliyor', variant: 'warning' },
  paid: { label: 'Ödendi - Hazırla', variant: 'success' },
  processing: { label: 'Hazırlanıyor', variant: 'info' },
  shipped: { label: 'Kargoda', variant: 'primary' },
  delivered: { label: 'Teslim Edildi', variant: 'success' },
  completed: { label: 'Tamamlandı', variant: 'success' },
  cancelled: { label: 'İptal', variant: 'danger' },
};

interface Sale {
  id: string;
  orderNumber: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
    imageUrl?: string | null;
  };
  buyer: {
    id: string;
    displayName: string;
  };
  shippingAddress: {
    fullName: string;
    address: string;
    city: string;
  };
  createdAt: string;
}

type FilterType = 'all' | 'paid' | 'processing' | 'shipped' | 'completed';

export default function SalesScreen() {
  const { isAuthenticated } = useAuthStore();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [shipDialog, setShipDialog] = useState<{ visible: boolean; order: Sale | null }>({
    visible: false,
    order: null,
  });
  const [trackingNumber, setTrackingNumber] = useState('');

  // Fetch sales
  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['orders', 'seller', filter],
    queryFn: async () => {
      try {
        const params: any = { role: 'seller', limit: 100 };
        if (filter !== 'all') {
          // Mobil UI 'processing' adını kullanır; backend enum'u 'preparing'. Sınırda çevir.
          params.status = filter === 'processing' ? 'preparing' : filter;
        }
        const response = await ordersApi.getAll(params);
        const raw = (response.data as any)?.data || response.data || [];
        // Backend 'preparing' → mobil 'processing' (badge/aksiyon/filtre tek isimle çalışsın).
        return (Array.isArray(raw) ? raw : []).map((o: any) =>
          o?.status === 'preparing' ? { ...o, status: 'processing' } : o,
        );
      } catch (error) {
        console.log('Failed to fetch sales');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const sales: Sale[] = salesData || [];

  // Kazanç özeti — AKTİF FİLTREDEN BAĞIMSIZ sunucu agregatı. Önceden totalEarnings/
  // pendingEarnings filtrelenmiş + sayfalı `sales` listesinden hesaplanıyordu → 'paid'
  // filtresine basınca toplam kazanç 0'a düşüyordu. Artık tüm siparişler üzerinden tek sorgu.
  const { data: earningsResp } = useQuery({
    queryKey: ['orders', 'seller', 'earnings'],
    queryFn: () => ordersApi.getSellerEarnings(),
    enabled: isAuthenticated,
  });
  const totalEarnings = earningsResp?.data?.totalEarnings ?? 0;
  const pendingEarnings = earningsResp?.data?.pendingEarnings ?? 0;

  /**
   * Backend'de tek "status update" endpoint'i yok; iki ayrı akış:
   *   - "processing"  → POST /orders/:id/prepare         (markAsPreparing)
   *   - "shipped"     → POST /shipping  + PATCH /shipping/:id/tracking
   * Bu mutasyon hangi durumun istendiğine göre doğru endpoint'i çağırır.
   */
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, trackingNumber }: { orderId: string; status: string; trackingNumber?: string }) => {
      if (status === 'processing' || status === 'preparing') {
        return ordersApi.markAsPreparing(orderId);
      }
      if (status === 'shipped') {
        const created = await shippingApi.createShipment({ orderId, provider: 'surat' });
        const shipment = (created.data as any)?.data ?? (created.data as any);
        if (trackingNumber && shipment?.id) {
          await shippingApi.updateTracking(shipment.id, { trackingNumber });
        }
        return created;
      }
      throw new Error(`Desteklenmeyen sipariş durumu: ${status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShipDialog({ visible: false, order: null });
      setTrackingNumber('');
      appAlert('Başarılı', 'Sipariş durumu güncellendi');
    },
    onError: (e: any) => {
      appAlert('Hata', e?.response?.data?.message || e?.message || 'Durum güncellenemedi');
    },
  });

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

  const getStatusLabel = (status: FilterType) => {
    if (status === 'all') return 'Tümü';
    return salesStatusConfig[status]?.label ?? status;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatPrice = (price: number) => {
    return `₺${price.toLocaleString('tr-TR')}`;
  };

  const handleMarkAsProcessing = (order: Sale) => {
    appAlert(
      'Siparişi Hazırlıyor Olarak İşaretle',
      'Siparişi hazırlamaya başladığınızı onaylıyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: () => updateStatusMutation.mutate({ orderId: order.id, status: 'processing' })
        },
      ]
    );
  };

  const handleShip = () => {
    if (!trackingNumber.trim()) {
      appAlert('Hata', 'Takip numarası giriniz');
      return;
    }
    if (shipDialog.order) {
      updateStatusMutation.mutate({
        orderId: shipDialog.order.id,
        status: 'shipped',
        trackingNumber: trackingNumber.trim(),
      });
    }
  };

  // totalEarnings / pendingEarnings yukarıda sunucu agregatından (filtreden bağımsız) geliyor.

  // Not authenticated or not a seller
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="storefront-outline" size={64} color={colors.primary[600]!} />
        <Text variant="h2" style={styles.title}>Satışlarım</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          Satışlarınızı görmek için giriş yapın
        </Text>
        <Button variant="primary" title="Giriş Yap" onPress={() => router.push('/(auth)/login')} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  const filteredSales = sales.filter(sale => {
    if (filter === 'all') return true;
    return sale.status === filter;
  });

  return (
    <View style={styles.container}>
      <ScreenHeader title="Satışlarım" onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />

      {/* Earnings Summary */}
      <Card variant="elevated" style={styles.earningsCard}>
        <View style={styles.earningsContent}>
          <View style={styles.earningItem}>
            <Text variant="caption" style={styles.earningLabel}>Tamamlanan</Text>
            <Text variant="h3" style={styles.earningValue}>{formatPrice(totalEarnings)}</Text>
          </View>
          <View style={styles.earningDivider} />
          <View style={styles.earningItem}>
            <Text variant="caption" style={styles.earningLabel}>Bekleyen</Text>
            <Text variant="h3" style={styles.earningValuePending}>{formatPrice(pendingEarnings)}</Text>
          </View>
        </View>
      </Card>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'paid', 'processing', 'shipped', 'completed'] as FilterType[]).map((f) => (
            <Chip
              key={f}
              label={getStatusLabel(f)}
              selected={filter === f}
              variant="primary"
              onPress={() => setFilter(f)}
              style={styles.filterChip}
            />
          ))}
        </ScrollView>
      </View>

      {/* Sales */}
      {isLoading && sales.length === 0 ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : filteredSales.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color={colors.text.subtle} />
          <Text variant="h3" style={styles.emptyTitle}>Henüz satışınız yok</Text>
          <Text variant="body" tone="muted" style={styles.emptySubtitle}>
            İlan oluşturarak satışa başlayın
          </Text>
          <Button variant="primary" title="İlan Oluştur" onPress={() => router.push('/(tabs)/sell')} style={{ alignSelf: 'center' }} />
        </View>
      ) : (
        <ScrollView
          style={styles.salesList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
          }
        >
          {filteredSales.map((sale) => (
            <Card key={sale.id} variant="elevated" style={styles.saleCard}>
              <View style={styles.saleHeader}>
                <Text variant="caption" style={styles.orderNumber}>
                  #{sale.orderNumber}
                </Text>
                <StatusBadge status={sale.status} config={salesStatusConfig} size="sm" />
              </View>

              <View style={styles.saleContent}>
                <Image
                  source={{ uri: getOrderProductImageUri(sale.product) }}
                  style={styles.productImage}
                />
                <View style={styles.saleInfo}>
                  <Text variant="label" numberOfLines={1}>{sale.product.title}</Text>
                  <Text variant="caption" style={styles.buyerName}>
                    Alıcı: {sale.buyer.displayName}
                  </Text>
                  <Text variant="caption" style={styles.addressText} numberOfLines={1}>
                    📍 {sale.shippingAddress.city}
                  </Text>
                </View>
                <View style={styles.priceSection}>
                  <Text variant="h3" style={styles.price}>
                    {formatPrice(sale.totalAmount)}
                  </Text>
                  <Text variant="caption" style={styles.dateText}>
                    {formatDate(sale.createdAt)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              {sale.status === 'paid' && (
                <View style={styles.actionButtons}>
                  <Button
                    variant="primary"
                    title="Hazırlanıyor Olarak İşaretle"
                    onPress={() => handleMarkAsProcessing(sale)}
                    isLoading={updateStatusMutation.isPending}
                  />
                </View>
              )}

              {sale.status === 'processing' && (
                <View style={styles.actionButtons}>
                  <Button
                    variant="primary"
                    title="Kargoya Ver"
                    onPress={() => setShipDialog({ visible: true, order: sale })}
                  />
                </View>
              )}
            </Card>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Ship Dialog */}
      <Modal
        isOpen={shipDialog.visible}
        onClose={() => setShipDialog({ visible: false, order: null })}
        title="Kargo Bilgisi"
      >
        <Text variant="body" style={{ marginBottom: 16 }}>
          {shipDialog.order?.product.title}
        </Text>
        <Input
          label="Kargo Takip Numarası"
          value={trackingNumber}
          onChangeText={setTrackingNumber}
          placeholder="Örn: 1234567890"
        />
        <View style={styles.dialogActions}>
          <Button
            variant="ghost"
            title="İptal"
            onPress={() => setShipDialog({ visible: false, order: null })}
          />
          <Button
            variant="primary"
            title="Kargoya Verildi"
            onPress={handleShip}
            isLoading={updateStatusMutation.isPending}
          />
        </View>
      </Modal>
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
  },
  earningsCard: {
    margin: 16,
    marginBottom: 8,
  },
  earningsContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningItem: {
    flex: 1,
    alignItems: 'center',
  },
  earningLabel: {
    color: colors.text.muted,
    marginBottom: 4,
  },
  earningValue: {
    color: colors.success[600]!,
    fontWeight: 'bold',
  },
  earningValuePending: {
    color: colors.warning[600]!,
    fontWeight: 'bold',
  },
  earningDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border.DEFAULT,
  },
  filterContainer: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChip: {
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
    color: colors.text.heading,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
  salesList: {
    flex: 1,
    padding: 16,
  },
  saleCard: {
    marginBottom: 12,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumber: {
    color: colors.text.muted,
  },
  saleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  saleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  buyerName: {
    color: colors.text.muted,
    marginTop: 2,
  },
  addressText: {
    color: colors.text.muted,
    marginTop: 2,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  price: {
    color: colors.primary[700]!,
    fontWeight: 'bold',
  },
  dateText: {
    color: colors.text.muted,
    marginTop: 2,
  },
  actionButtons: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});
