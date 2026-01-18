import { View, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl, Alert } from 'react-native';
import { Text, Chip, ActivityIndicator, Card, Button, TextInput, Portal, Dialog } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/authStore';
import { TarodanColors } from '../../src/theme';

interface Sale {
  id: string;
  orderNumber: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';
  totalAmount: number;
  product: {
    id: string;
    title: string;
    images?: Array<{ url: string }>;
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
  const { isAuthenticated, user } = useAuthStore();
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
        const params: any = { role: 'seller' };
        if (filter !== 'all') {
          params.status = filter;
        }
        const response = await api.get('/orders', { params });
        return response.data?.data || response.data || [];
      } catch (error) {
        console.log('Failed to fetch sales');
        return [];
      }
    },
    enabled: isAuthenticated,
  });

  const sales: Sale[] = salesData || [];

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, trackingNumber }: { orderId: string; status: string; trackingNumber?: string }) => {
      return api.patch(`/orders/${orderId}/status`, { status, trackingNumber });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShipDialog({ visible: false, order: null });
      setTrackingNumber('');
      Alert.alert('Başarılı', 'Sipariş durumu güncellendi');
    },
    onError: () => {
      Alert.alert('Hata', 'Durum güncellenemedi');
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

  const getStatusColor = (status: Sale['status']) => {
    switch (status) {
      case 'pending': return TarodanColors.warning;
      case 'paid': return TarodanColors.success;
      case 'processing': return TarodanColors.info;
      case 'shipped': return TarodanColors.primary;
      case 'delivered': return TarodanColors.success;
      case 'completed': return TarodanColors.success;
      case 'cancelled': return TarodanColors.error;
      default: return TarodanColors.textSecondary;
    }
  };

  const getStatusText = (status: Sale['status']) => {
    switch (status) {
      case 'pending': return 'Ödeme Bekliyor';
      case 'paid': return 'Ödendi - Hazırla';
      case 'processing': return 'Hazırlanıyor';
      case 'shipped': return 'Kargoda';
      case 'delivered': return 'Teslim Edildi';
      case 'completed': return 'Tamamlandı';
      case 'cancelled': return 'İptal';
      default: return status;
    }
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
    Alert.alert(
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
      Alert.alert('Hata', 'Takip numarası giriniz');
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

  // Calculate totals
  const totalEarnings = sales
    .filter(s => ['delivered', 'completed'].includes(s.status))
    .reduce((sum, s) => sum + s.totalAmount, 0);

  const pendingEarnings = sales
    .filter(s => ['paid', 'processing', 'shipped'].includes(s.status))
    .reduce((sum, s) => sum + s.totalAmount, 0);

  // Not authenticated or not a seller
  if (!isAuthenticated) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="storefront-outline" size={64} color={TarodanColors.primary} />
        <Text variant="titleLarge" style={styles.title}>Satışlarım</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Satışlarınızı görmek için giriş yapın
        </Text>
        <Button mode="contained" onPress={() => router.push('/(auth)/login')}>
          Giriş Yap
        </Button>
      </View>
    );
  }

  const filteredSales = sales.filter(sale => {
    if (filter === 'all') return true;
    return sale.status === filter;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Satışlarım</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Earnings Summary */}
      <Card style={styles.earningsCard}>
        <Card.Content style={styles.earningsContent}>
          <View style={styles.earningItem}>
            <Text variant="bodySmall" style={styles.earningLabel}>Tamamlanan</Text>
            <Text variant="titleMedium" style={styles.earningValue}>{formatPrice(totalEarnings)}</Text>
          </View>
          <View style={styles.earningDivider} />
          <View style={styles.earningItem}>
            <Text variant="bodySmall" style={styles.earningLabel}>Bekleyen</Text>
            <Text variant="titleMedium" style={styles.earningValuePending}>{formatPrice(pendingEarnings)}</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(['all', 'paid', 'processing', 'shipped', 'completed'] as FilterType[]).map((f) => (
            <Chip
              key={f}
              selected={filter === f}
              onPress={() => setFilter(f)}
              style={[styles.filterChip, filter === f && styles.filterChipSelected]}
              textStyle={filter === f ? styles.filterChipTextSelected : styles.filterChipText}
            >
              {f === 'all' ? 'Tümü' : getStatusText(f as Sale['status'])}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {/* Sales */}
      {isLoading && sales.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
        </View>
      ) : filteredSales.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cart-outline" size={80} color={TarodanColors.textLight} />
          <Text variant="titleMedium" style={styles.emptyTitle}>Henüz satışınız yok</Text>
          <Text variant="bodyMedium" style={styles.emptySubtitle}>
            İlan oluşturarak satışa başlayın
          </Text>
          <Button mode="contained" onPress={() => router.push('/(tabs)/create')}>
            İlan Oluştur
          </Button>
        </View>
      ) : (
        <ScrollView
          style={styles.salesList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          {filteredSales.map((sale) => (
            <Card key={sale.id} style={styles.saleCard}>
              <View style={styles.saleHeader}>
                <Text variant="bodySmall" style={styles.orderNumber}>
                  #{sale.orderNumber}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(sale.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(sale.status) }]}>
                    {getStatusText(sale.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.saleContent}>
                <Image
                  source={{ uri: sale.product.images?.[0]?.url || 'https://via.placeholder.com/60' }}
                  style={styles.productImage}
                />
                <View style={styles.saleInfo}>
                  <Text variant="titleSmall" numberOfLines={1}>{sale.product.title}</Text>
                  <Text variant="bodySmall" style={styles.buyerName}>
                    Alıcı: {sale.buyer.displayName}
                  </Text>
                  <Text variant="bodySmall" style={styles.addressText} numberOfLines={1}>
                    📍 {sale.shippingAddress.city}
                  </Text>
                </View>
                <View style={styles.priceSection}>
                  <Text variant="titleMedium" style={styles.price}>
                    {formatPrice(sale.totalAmount)}
                  </Text>
                  <Text variant="bodySmall" style={styles.dateText}>
                    {formatDate(sale.createdAt)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              {sale.status === 'paid' && (
                <View style={styles.actionButtons}>
                  <Button
                    mode="contained"
                    compact
                    onPress={() => handleMarkAsProcessing(sale)}
                    loading={updateStatusMutation.isPending}
                  >
                    Hazırlanıyor Olarak İşaretle
                  </Button>
                </View>
              )}

              {sale.status === 'processing' && (
                <View style={styles.actionButtons}>
                  <Button
                    mode="contained"
                    compact
                    onPress={() => setShipDialog({ visible: true, order: sale })}
                  >
                    Kargoya Ver
                  </Button>
                </View>
              )}
            </Card>
          ))}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Ship Dialog */}
      <Portal>
        <Dialog visible={shipDialog.visible} onDismiss={() => setShipDialog({ visible: false, order: null })}>
          <Dialog.Title>Kargo Bilgisi</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
              {shipDialog.order?.product.title}
            </Text>
            <TextInput
              label="Kargo Takip Numarası"
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              mode="outlined"
              placeholder="Örn: 1234567890"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShipDialog({ visible: false, order: null })}>İptal</Button>
            <Button 
              mode="contained"
              onPress={handleShip}
              loading={updateStatusMutation.isPending}
            >
              Kargoya Verildi
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  earningsCard: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: TarodanColors.background,
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
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  earningValue: {
    color: TarodanColors.success,
    fontWeight: 'bold',
  },
  earningValuePending: {
    color: TarodanColors.warning,
    fontWeight: 'bold',
  },
  earningDivider: {
    width: 1,
    height: 40,
    backgroundColor: TarodanColors.border,
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
  salesList: {
    flex: 1,
    padding: 16,
  },
  saleCard: {
    marginBottom: 12,
    backgroundColor: TarodanColors.background,
    padding: 12,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  saleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  saleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  buyerName: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  addressText: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  price: {
    color: TarodanColors.primary,
    fontWeight: 'bold',
  },
  dateText: {
    color: TarodanColors.textSecondary,
    marginTop: 2,
  },
  actionButtons: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
});
