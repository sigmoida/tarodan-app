/**
 * Trades Screen
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
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTradesStore, TradeStatus } from '../../stores/tradesStore';
import { useAuthStore } from '../../stores/authStore';

const STATUS_LABELS: Record<TradeStatus, string> = {
  pending: 'Bekliyor',
  accepted: 'Kabul Edildi',
  rejected: 'Reddedildi',
  initiator_shipped: 'Kargo Gönderildi',
  receiver_shipped: 'Kargo Alındı',
  initiator_delivered: 'Teslim Edildi',
  receiver_delivered: 'Teslim Alındı',
  confirmed: 'Tamamlandı',
  cancelled: 'İptal Edildi',
};

const STATUS_COLORS: Record<TradeStatus, string> = {
  pending: '#FFC107',
  accepted: '#2196F3',
  rejected: '#F44336',
  initiator_shipped: '#9C27B0',
  receiver_shipped: '#9C27B0',
  initiator_delivered: '#4CAF50',
  receiver_delivered: '#4CAF50',
  confirmed: '#4CAF50',
  cancelled: '#9E9E9E',
};

const FILTER_TABS: { label: string; value: TradeStatus | undefined }[] = [
  { label: 'Tümü', value: undefined },
  { label: 'Bekleyen', value: 'pending' },
  { label: 'Aktif', value: 'accepted' },
  { label: 'Tamamlanan', value: 'confirmed' },
];

const TradeCard = ({ trade, currentUserId, onPress }: any) => {
  const isInitiator = trade.initiator.id === currentUserId;
  const otherUser = isInitiator ? trade.receiver : trade.initiator;
  const myListings = isInitiator ? trade.initiator_listings : trade.receiver_listings;
  const theirListings = isInitiator ? trade.receiver_listings : trade.initiator_listings;
  
  return (
    <TouchableOpacity style={styles.tradeCard} onPress={onPress}>
      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[trade.status] }]}>
        <Text style={styles.statusText}>{STATUS_LABELS[trade.status]}</Text>
      </View>

      {/* Trade Visual */}
      <View style={styles.tradeVisual}>
        {/* My Items */}
        <View style={styles.tradeItems}>
          <Text style={styles.itemsLabel}>Benim</Text>
          <View style={styles.itemsPreview}>
            {myListings.slice(0, 2).map((item: any, i: number) => (
              <Image
                key={i}
                source={{ uri: item.images?.[0] || 'https://via.placeholder.com/60' }}
                style={[styles.itemImage, i > 0 && { marginLeft: -20 }]}
              />
            ))}
            {myListings.length > 2 && (
              <View style={[styles.moreItems, { marginLeft: -20 }]}>
                <Text style={styles.moreItemsText}>+{myListings.length - 2}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Swap Icon */}
        <View style={styles.swapIcon}>
          <Icon name="swap-horizontal" size={24} color="#757575" />
        </View>

        {/* Their Items */}
        <View style={styles.tradeItems}>
          <Text style={styles.itemsLabel}>{otherUser.username}</Text>
          <View style={styles.itemsPreview}>
            {theirListings.slice(0, 2).map((item: any, i: number) => (
              <Image
                key={i}
                source={{ uri: item.images?.[0] || 'https://via.placeholder.com/60' }}
                style={[styles.itemImage, i > 0 && { marginLeft: -20 }]}
              />
            ))}
            {theirListings.length > 2 && (
              <View style={[styles.moreItems, { marginLeft: -20 }]}>
                <Text style={styles.moreItemsText}>+{theirListings.length - 2}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Cash Amount */}
      {trade.cash_amount > 0 && (
        <View style={styles.cashRow}>
          <Icon 
            name={trade.cash_direction === 'initiator_to_receiver' ? 'arrow-forward' : 'arrow-back'} 
            size={16} 
            color="#4CAF50" 
          />
          <Text style={styles.cashText}>
            +₺{(trade.cash_amount ?? 0).toLocaleString('tr-TR')}
          </Text>
        </View>
      )}

      {/* Date */}
      <Text style={styles.dateText}>
        {new Date(trade.created_at).toLocaleDateString('tr-TR')}
      </Text>

      <Icon name="chevron-forward" size={20} color="#BDBDBD" style={styles.chevron} />
    </TouchableOpacity>
  );
};

const TradesScreen = ({ navigation }: any) => {
  const [activeFilter, setActiveFilter] = useState<TradeStatus | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const { trades, fetchTrades, isLoading } = useTradesStore();
  const { user } = useAuthStore();

  useEffect(() => {
    fetchTrades(activeFilter);
  }, [activeFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTrades(activeFilter);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.label}
            style={[styles.filterTab, activeFilter === tab.value && styles.filterTabActive]}
            onPress={() => setActiveFilter(tab.value)}
          >
            <Text style={[
              styles.filterTabText,
              activeFilter === tab.value && styles.filterTabTextActive
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trades List */}
      <FlatList
        data={trades}
        renderItem={({ item }) => (
          <TradeCard
            trade={item}
            currentUserId={user?.id}
            onPress={() => navigation.navigate('TradeDetail', { id: item.id })}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon name="swap-horizontal-outline" size={64} color="#BDBDBD" />
              <Text style={styles.emptyTitle}>Henüz takas yok</Text>
              <Text style={styles.emptyText}>
                İlanlara göz atın ve takas teklifleri gönderin
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <ActivityIndicator size="large" color="#E53935" style={{ marginVertical: 20 }} />
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
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#E53935',
  },
  filterTabText: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  listContainer: {
    padding: 16,
  },
  tradeCard: {
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
  statusBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  tradeVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  tradeItems: {
    flex: 1,
    alignItems: 'center',
  },
  itemsLabel: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 8,
  },
  itemsPreview: {
    flexDirection: 'row',
    justifyContent: 'center',
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
  swapIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  cashText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#9E9E9E',
    textAlign: 'center',
  },
  chevron: {
    position: 'absolute',
    right: 16,
    top: '50%',
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

export default TradesScreen;


