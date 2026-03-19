/**
 * Listings Screen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Modal,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useListingsStore } from '../../stores/listingsStore';
import { safeString } from '../../utils/safeString';
import { getImageUrl } from '../../utils/imageUrl';
import { isProductTradeOpen } from '../../utils/isProductTradeOpen';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const ListingCard = ({ item, onPress }: any) => (
  <TouchableOpacity style={styles.listingCard} onPress={onPress}>
    <View style={styles.listingImageWrap}>
      <Image
        source={{ uri: getImageUrl(item.images) }}
        style={styles.listingImage}
      />
      {isProductTradeOpen(item) && (
        <View style={styles.tradeBadge}>
          <Icon name="swap-horizontal" size={12} color="#FFF" />
        </View>
      )}
    </View>
    <View style={styles.listingInfo}>
      <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.listingMeta}>{safeString(item.brand, 'Marka')} • {safeString(item.scale, '1:64')}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.listingPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
        <View style={styles.conditionBadge}>
          <Text style={styles.conditionText}>{safeString(item.condition)}</Text>
        </View>
      </View>
    </View>
  </TouchableOpacity>
);

const FilterModal = ({ visible, onClose, filters, setFilters }: any) => {
  const [localFilters, setLocalFilters] = useState(filters);
  
  const CONDITIONS = ['Yeni', 'Mükemmel', 'İyi', 'Orta'];
  const SCALES = ['1:18', '1:24', '1:43', '1:64'];

  const applyFilters = () => {
    setFilters(localFilters);
    onClose();
  };

  const clearFilters = () => {
    setLocalFilters({});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Filtreler</Text>
          <TouchableOpacity onPress={onClose}>
            <Icon name="close" size={24} color="#212121" />
          </TouchableOpacity>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Durum</Text>
          <View style={styles.filterOptions}>
            {CONDITIONS.map((condition) => (
              <TouchableOpacity
                key={condition}
                style={[
                  styles.filterChip,
                  localFilters.condition === condition && styles.filterChipActive,
                ]}
                onPress={() => setLocalFilters({ ...localFilters, condition })}
              >
                <Text style={[
                  styles.filterChipText,
                  localFilters.condition === condition && styles.filterChipTextActive,
                ]}>
                  {condition}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Ölçek</Text>
          <View style={styles.filterOptions}>
            {SCALES.map((scale) => (
              <TouchableOpacity
                key={scale}
                style={[
                  styles.filterChip,
                  localFilters.scale === scale && styles.filterChipActive,
                ]}
                onPress={() => setLocalFilters({ ...localFilters, scale })}
              >
                <Text style={[
                  styles.filterChipText,
                  localFilters.scale === scale && styles.filterChipTextActive,
                ]}>
                  {scale}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Fiyat Aralığı</Text>
          <View style={styles.priceInputs}>
            <TextInput
              style={styles.priceInput}
              placeholder="Min ₺"
              keyboardType="numeric"
              value={localFilters.minPrice?.toString() || ''}
              onChangeText={(val) => setLocalFilters({ ...localFilters, minPrice: val ? Number(val) : undefined })}
            />
            <Text style={styles.priceSeparator}>-</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="Max ₺"
              keyboardType="numeric"
              value={localFilters.maxPrice?.toString() || ''}
              onChangeText={(val) => setLocalFilters({ ...localFilters, maxPrice: val ? Number(val) : undefined })}
            />
          </View>
        </View>

        <View style={styles.filterSection}>
          <TouchableOpacity 
            style={[
              styles.filterChip,
              localFilters.tradeOnly && styles.filterChipActive,
              { alignSelf: 'flex-start' }
            ]}
            onPress={() => setLocalFilters({ ...localFilters, tradeOnly: !localFilters.tradeOnly })}
          >
            <Icon 
              name="swap-horizontal" 
              size={16} 
              color={localFilters.tradeOnly ? '#FFF' : '#757575'} 
            />
            <Text style={[
              styles.filterChipText,
              localFilters.tradeOnly && styles.filterChipTextActive,
              { marginLeft: 6 }
            ]}>
              Sadece Takas
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
            <Text style={styles.clearButtonText}>Temizle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
            <Text style={styles.applyButtonText}>Uygula</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const ListingsScreen = ({ navigation }: any) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const { 
    listings, 
    fetchListings, 
    isLoading, 
    hasMore, 
    filters, 
    setFilters,
    resetFilters 
  } = useListingsStore();

  useEffect(() => {
    fetchListings(true);
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setFilters({ search: searchQuery.trim() });
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoading) {
      fetchListings();
    }
  };

  const activeFilterCount = Object.keys(filters).filter(k => filters[k as keyof typeof filters]).length;

  return (
    <View style={styles.container}>
      {/* Search & Filter Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Icon name="search" size={20} color="#757575" />
          <TextInput
            style={styles.searchInput}
            placeholder="Model, marka ara..."
            placeholderTextColor="#9E9E9E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); resetFilters(); }}>
              <Icon name="close-circle" size={20} color="#757575" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFilter(true)}
        >
          <Icon name="options" size={22} color="#212121" />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Create Listing Button */}
      <TouchableOpacity 
        style={styles.createButton}
        onPress={() => navigation.navigate('CreateListing')}
      >
        <Icon name="add" size={20} color="#FFF" />
        <Text style={styles.createButtonText}>İlan Oluştur</Text>
      </TouchableOpacity>

      {/* Listings Grid */}
      <FlatList
        data={listings}
        renderItem={({ item }) => (
          <ListingCard 
            item={item} 
            onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        columnWrapperStyle={styles.listingsRow}
        contentContainerStyle={styles.listingsContainer}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <Icon name="car-outline" size={64} color="#BDBDBD" />
              <Text style={styles.emptyText}>Henüz ilan bulunamadı</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isLoading ? (
            <ActivityIndicator size="large" color="#E53935" style={{ marginVertical: 20 }} />
          ) : null
        }
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        filters={filters}
        setFilters={setFilters}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#212121',
    marginLeft: 8,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E53935',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  listingsContainer: {
    padding: 16,
  },
  listingsRow: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listingCard: {
    width: CARD_WIDTH,
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listingImageWrap: {
    position: 'relative',
    width: '100%',
    height: CARD_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  listingImage: {
    width: '100%',
    height: '100%',
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#4CAF50',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    padding: 12,
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
    lineHeight: 18,
  },
  listingMeta: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E53935',
  },
  conditionBadge: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  conditionText: {
    fontSize: 10,
    color: '#757575',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212121',
  },
  filterSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterChipActive: {
    backgroundColor: '#E53935',
  },
  filterChipText: {
    fontSize: 14,
    color: '#757575',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  priceInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  priceSeparator: {
    marginHorizontal: 12,
    color: '#757575',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    marginTop: 'auto',
  },
  clearButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    color: '#757575',
    fontWeight: '500',
  },
  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
});

export default ListingsScreen;


