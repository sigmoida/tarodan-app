import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { Text, Card, Searchbar, ActivityIndicator, Chip, IconButton, Menu, Divider } from 'react-native-paper';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from '../src/services/api';
import { TarodanColors, BRANDS, SCALES } from '../src/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const CONDITIONS = [
  { id: 'new', name: 'Yeni' },
  { id: 'very_good', name: 'Mükemmel' },
  { id: 'good', name: 'İyi' },
  { id: 'fair', name: 'Orta' },
];

const SORT_OPTIONS = [
  { id: 'created_desc', name: 'En Yeni' },
  { id: 'created_asc', name: 'En Eski' },
  { id: 'price_asc', name: 'Fiyat: Düşükten Yükseğe' },
  { id: 'price_desc', name: 'Fiyat: Yüksekten Düşüğe' },
  { id: 'title_asc', name: 'A-Z' },
  { id: 'title_desc', name: 'Z-A' },
];

export default function ListingsScreen() {
  const params = useLocalSearchParams<{ 
    brand?: string; 
    scale?: string; 
    categoryId?: string;
    search?: string;
  }>();
  
  const [searchQuery, setSearchQuery] = useState(params.search || '');
  const [showFilters, setShowFilters] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [filters, setFilters] = useState({
    brand: params.brand || '',
    scale: params.scale || '',
    condition: '',
    minPrice: '',
    maxPrice: '',
    tradeOnly: false,
    sortBy: 'created_desc',
  });

  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ['listings', searchQuery, filters],
    queryFn: async () => {
      try {
        const queryParams: any = {
          limit: 100,
          page: 1,
        };
        
        if (searchQuery) queryParams.search = searchQuery;
        if (filters.brand) queryParams.brand = filters.brand;
        if (filters.scale) queryParams.scale = filters.scale;
        if (filters.condition) queryParams.condition = filters.condition;
        if (filters.minPrice) queryParams.minPrice = Number(filters.minPrice);
        if (filters.maxPrice) queryParams.maxPrice = Number(filters.maxPrice);
        if (filters.tradeOnly) queryParams.tradeOnly = true;
        if (filters.sortBy) queryParams.sortBy = filters.sortBy;
        if (params.categoryId) queryParams.categoryId = params.categoryId;
        
        const response = await productsApi.getAll(queryParams);
        return response.data.data || response.data.products || [];
      } catch (error) {
        console.log('⚠️ Listings fetch error:', error);
        return [];
      }
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSearch = () => {
    refetch();
  };

  const clearFilters = () => {
    setFilters({
      brand: '',
      scale: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      tradeOnly: false,
      sortBy: 'created_desc',
    });
  };

  const activeFilterCount = [
    filters.brand,
    filters.scale,
    filters.condition,
    filters.minPrice,
    filters.maxPrice,
    filters.tradeOnly,
  ].filter(Boolean).length;

  const getImageUrl = (item: any) => {
    if (item.images && item.images.length > 0) {
      return typeof item.images[0] === 'string' ? item.images[0] : item.images[0].url;
    }
    return 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
  };

  const renderProductCard = (item: any) => {
    const isTradeEnabled = item.isTradeEnabled || item.trade_available;
    
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.productCard}
        onPress={() => router.push(`/product/${item.id}`)}
      >
        <View style={styles.productImageContainer}>
          <Image source={{ uri: getImageUrl(item) }} style={styles.productImage} />
          {isTradeEnabled && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color="#fff" />
              <Text style={styles.tradeBadgeText}>Takas</Text>
            </View>
          )}
        </View>
        <View style={styles.productContent}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.productMeta}>{item.brand || 'Marka'} • {item.scale || '1:64'}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
            {item.condition && (
              <Text style={styles.conditionBadge}>{item.condition}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const getSortLabel = () => {
    return SORT_OPTIONS.find(o => o.id === filters.sortBy)?.name || 'Sırala';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={TarodanColors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İlanlar</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search & Sort */}
      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Model, marka ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          style={styles.searchBar}
        />
        <View style={styles.actionRow}>
          <Menu
            visible={sortMenuVisible}
            onDismiss={() => setSortMenuVisible(false)}
            anchor={
              <TouchableOpacity 
                style={styles.sortButton}
                onPress={() => setSortMenuVisible(true)}
              >
                <Ionicons name="swap-vertical" size={18} color={TarodanColors.textSecondary} />
                <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
              </TouchableOpacity>
            }
          >
            {SORT_OPTIONS.map((option) => (
              <Menu.Item
                key={option.id}
                onPress={() => {
                  setFilters({ ...filters, sortBy: option.id });
                  setSortMenuVisible(false);
                }}
                title={option.name}
                leadingIcon={filters.sortBy === option.id ? 'check' : undefined}
              />
            ))}
          </Menu>

          <TouchableOpacity
            style={[styles.filterButton, showFilters && styles.filterButtonActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name="options-outline" 
              size={18} 
              color={showFilters ? '#fff' : TarodanColors.textSecondary} 
            />
            <Text style={[styles.filterButtonText, showFilters && styles.filterButtonTextActive]}>
              Filtreler
            </Text>
            {activeFilterCount > 0 && (
              <View style={[styles.filterBadge, showFilters && styles.filterBadgeActive]}>
                <Text style={[styles.filterBadgeText, showFilters && styles.filterBadgeTextActive]}>
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Brand Filter */}
            {BRANDS.slice(0, 6).map((brand) => (
              <Chip
                key={brand.id}
                selected={filters.brand === brand.name}
                onPress={() => setFilters({ ...filters, brand: filters.brand === brand.name ? '' : brand.name })}
                style={styles.filterChip}
                textStyle={filters.brand === brand.name ? styles.filterChipTextActive : undefined}
              >
                {brand.name}
              </Chip>
            ))}
          </ScrollView>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Scale Filter */}
            {SCALES.map((scale) => (
              <Chip
                key={scale.id}
                selected={filters.scale === scale.id}
                onPress={() => setFilters({ ...filters, scale: filters.scale === scale.id ? '' : scale.id })}
                style={styles.filterChip}
                textStyle={filters.scale === scale.id ? styles.filterChipTextActive : undefined}
              >
                {scale.name}
              </Chip>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Condition Filter */}
            {CONDITIONS.map((cond) => (
              <Chip
                key={cond.id}
                selected={filters.condition === cond.id}
                onPress={() => setFilters({ ...filters, condition: filters.condition === cond.id ? '' : cond.id })}
                style={styles.filterChip}
                textStyle={filters.condition === cond.id ? styles.filterChipTextActive : undefined}
              >
                {cond.name}
              </Chip>
            ))}
            
            {/* Trade Only */}
            <Chip
              selected={filters.tradeOnly}
              onPress={() => setFilters({ ...filters, tradeOnly: !filters.tradeOnly })}
              style={styles.filterChip}
              icon="swap-horizontal"
              textStyle={filters.tradeOnly ? styles.filterChipTextActive : undefined}
            >
              Sadece Takas
            </Chip>
          </ScrollView>

          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearFilters}>
              <Ionicons name="close-circle" size={16} color={TarodanColors.primary} />
              <Text style={styles.clearFiltersText}>Filtreleri Temizle</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Listings */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>İlanlar yükleniyor...</Text>
        </View>
      ) : !listings || listings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={64} color={TarodanColors.textLight} />
          <Text style={styles.emptyTitle}>İlan bulunamadı</Text>
          <Text style={styles.emptySubtitle}>Farklı filtreler deneyebilirsiniz</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listingsContainer}
          contentContainerStyle={styles.listingsContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TarodanColors.primary]} />
          }
        >
          <Text style={styles.resultsCount}>{listings.length} ilan bulundu</Text>
          <View style={styles.productsGrid}>
            {listings.map((item: any) => renderProductCard(item))}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
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
  searchSection: {
    backgroundColor: TarodanColors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  sortButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterButtonActive: {
    backgroundColor: TarodanColors.primary,
  },
  filterButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: TarodanColors.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterBadgeActive: {
    backgroundColor: '#fff',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterBadgeTextActive: {
    color: TarodanColors.primary,
  },
  filtersPanel: {
    backgroundColor: TarodanColors.background,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  filterChips: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    marginRight: 8,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  clearFiltersText: {
    marginLeft: 6,
    fontSize: 13,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: TarodanColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
  },
  listingsContainer: {
    flex: 1,
  },
  listingsContent: {
    padding: 16,
  },
  resultsCount: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
    marginBottom: 12,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: TarodanColors.background,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH * 0.9,
    backgroundColor: TarodanColors.surfaceVariant,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  productContent: {
    padding: 12,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  conditionBadge: {
    fontSize: 10,
    color: TarodanColors.textSecondary,
    backgroundColor: TarodanColors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
