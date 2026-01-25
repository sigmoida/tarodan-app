/**
 * My Listings Screen
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
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import api from '../../services/api';

// Product status labels matching backend enum
const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  pending: 'Onay Bekliyor',
  active: 'Aktif',
  reserved: 'Rezerve',
  sold: 'Satıldı',
  inactive: 'Pasif',
  rejected: 'Reddedildi',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#E0E0E0', text: '#757575' },
  pending: { bg: '#FFF3E0', text: '#FF9800' },
  active: { bg: '#E8F5E9', text: '#4CAF50' },
  reserved: { bg: '#E3F2FD', text: '#2196F3' },
  sold: { bg: '#F3E5F5', text: '#9C27B0' },
  inactive: { bg: '#ECEFF1', text: '#607D8B' },
  rejected: { bg: '#FFEBEE', text: '#F44336' },
};

// Filter tabs
const FILTER_TABS = [
  { key: 'all', label: 'Tümü' },
  { key: 'active', label: 'Aktif' },
  { key: 'pending', label: 'Bekliyor' },
  { key: 'sold', label: 'Satıldı' },
  { key: 'reserved', label: 'Rezerve' },
];

const MyListingsScreen = ({ navigation }: any) => {
  const [listings, setListings] = useState<any[]>([]);
  const [filteredListings, setFilteredListings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    // Filter listings based on active filter
    if (activeFilter === 'all') {
      setFilteredListings(listings);
    } else {
      setFilteredListings(listings.filter(item => item.status === activeFilter));
    }
  }, [activeFilter, listings]);

  const loadListings = async () => {
    try {
      const response = await api.get('/products/my');
      const data = response.data?.data || response.data || [];
      setListings(data);
    } catch (error) {
      console.error('Failed to load listings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadListings();
    setRefreshing(false);
  };

  // Get counts for each status
  const getStatusCount = (status: string) => {
    if (status === 'all') return listings.length;
    return listings.filter(item => item.status === status).length;
  };

  const renderItem = ({ item }: any) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const statusLabel = STATUS_LABELS[item.status] || item.status;
    
    return (
      <TouchableOpacity
        style={styles.listingCard}
        onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
      >
        <Image
          source={{ uri: item.imageUrl || item.images?.[0]?.url || 'https://via.placeholder.com/100' }}
          style={styles.listingImage}
        />
        <View style={styles.listingInfo}>
          <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Icon name="eye-outline" size={14} color="#757575" />
              <Text style={styles.statText}>{item.viewCount || 0}</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="heart-outline" size={14} color="#757575" />
              <Text style={styles.statText}>{item.likeCount || 0}</Text>
            </View>
          </View>
          <Text style={styles.listingPrice}>₺{Number(item.price)?.toLocaleString('tr-TR')}</Text>
        </View>
        <View style={styles.statusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {statusLabel}
            </Text>
          </View>
          <Icon name="chevron-forward" size={20} color="#BDBDBD" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.filterTab,
              activeFilter === tab.key && styles.filterTabActive
            ]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text style={[
              styles.filterTabText,
              activeFilter === tab.key && styles.filterTabTextActive
            ]}>
              {tab.label} ({getStatusCount(tab.key)})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredListings}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon name="list-outline" size={64} color="#BDBDBD" />
              <Text style={styles.emptyTitle}>
                {activeFilter === 'all' ? 'Henüz ilanınız yok' : `${FILTER_TABS.find(t => t.key === activeFilter)?.label} ilan yok`}
              </Text>
              <Text style={styles.emptyText}>
                {activeFilter === 'all' ? 'İlk ilanınızı oluşturun' : 'Bu kategoride ilan bulunmuyor'}
              </Text>
              {activeFilter === 'all' && (
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => navigation.navigate('Listings', { screen: 'CreateListing' })}
                >
                  <Icon name="add" size={20} color="#FFF" />
                  <Text style={styles.createButtonText}>İlan Oluştur</Text>
                </TouchableOpacity>
              )}
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
  filterContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#E53935',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#757575',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  listContainer: {
    padding: 16,
  },
  listingCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  listingImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  listingInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  listingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#757575',
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E53935',
    marginTop: 4,
  },
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
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
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E53935',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default MyListingsScreen;


