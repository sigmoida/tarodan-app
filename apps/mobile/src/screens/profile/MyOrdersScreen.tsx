/**
 * My Orders Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import api from '../../services/api';

// Backend order status values
const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Ödeme Bekliyor',
  paid: 'Ödendi',
  preparing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  completed: 'Tamamlandı',
  cancelled: 'İptal Edildi',
  refund_requested: 'İade Talebi',
  refunded: 'İade Edildi',
  // Legacy status mappings for backwards compatibility
  pending: 'Onay Bekliyor',
  confirmed: 'Onaylandı',
  processing: 'Hazırlanıyor',
};

const STATUS_COLORS: Record<string, string> = {
  pending_payment: '#FFC107',
  paid: '#2196F3',
  preparing: '#9C27B0',
  shipped: '#FF9800',
  delivered: '#4CAF50',
  completed: '#4CAF50',
  cancelled: '#9E9E9E',
  refund_requested: '#FF5722',
  refunded: '#795548',
  // Legacy status mappings
  pending: '#FFC107',
  confirmed: '#2196F3',
  processing: '#9C27B0',
};

const MyOrdersScreen = ({ navigation }: any) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const response = await api.getOrders();
      setOrders(response.orders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { id: item.id })}
    >
      {/* Order Header */}
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderNumber}>Sipariş #{item.id}</Text>
          <Text style={styles.orderDate}>
            {new Date(item.created_at).toLocaleDateString('tr-TR')}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
            {STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>

      {/* Order Items Preview */}
      <View style={styles.itemsPreview}>
        {item.items?.slice(0, 3).map((orderItem: any, i: number) => (
          <Image
            key={i}
            source={{ uri: orderItem.image || 'https://via.placeholder.com/50' }}
            style={[styles.itemImage, i > 0 && { marginLeft: -15 }]}
          />
        ))}
        {item.items?.length > 3 && (
          <View style={[styles.moreItems, { marginLeft: -15 }]}>
            <Text style={styles.moreItemsText}>+{item.items.length - 3}</Text>
          </View>
        )}
        <View style={styles.itemCountContainer}>
          <Text style={styles.itemCount}>{item.items?.length || 0} ürün</Text>
        </View>
      </View>

      {/* Order Footer */}
      <View style={styles.orderFooter}>
        <Text style={styles.totalLabel}>Toplam</Text>
        <Text style={styles.totalValue}>₺{item.total?.toLocaleString('tr-TR')}</Text>
      </View>

      {/* Tracking Button (if shipped) */}
      {item.status === 'shipped' && item.tracking_number && (
        <TouchableOpacity style={styles.trackButton}>
          <Icon name="location-outline" size={18} color="#E53935" />
          <Text style={styles.trackButtonText}>Kargo Takip</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon name="bag-handle-outline" size={64} color="#BDBDBD" />
              <Text style={styles.emptyTitle}>Henüz siparişiniz yok</Text>
              <Text style={styles.emptyText}>
                İlanlara göz atın ve alışverişe başlayın
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  listContainer: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  orderDate: {
    fontSize: 13,
    color: '#757575',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: '#F5F5F5',
  },
  moreItems: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  moreItemsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#757575',
  },
  itemCountContainer: {
    marginLeft: 'auto',
  },
  itemCount: {
    fontSize: 13,
    color: '#757575',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  totalLabel: {
    fontSize: 14,
    color: '#757575',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E53935',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E53935',
  },
  trackButtonText: {
    color: '#E53935',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default MyOrdersScreen;


