import { View, ScrollView, StyleSheet, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { theme, Text, Input, Chip, Spinner, Modal } from '@tarodan/ui-native';
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from '../src/services/api';
import { BRANDS, SCALES } from '../src/theme';
import { getImageUrl as getImageUrlFromUtils } from '../src/utils/imageUrl';

const { colors } = theme;
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
    return getImageUrlFromUtils(item.images);
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
              <Ionicons name="swap-horizontal" size={12} color={colors.white} />
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
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>İlanlar</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search & Sort */}
      <View style={styles.searchSection}>
        <Input
          placeholder="Model, marka ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          leftIconName="search"
          containerStyle={styles.searchBar}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortMenuVisible(true)}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.text.muted} />
            <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, showFilters && styles.filterButtonActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={showFilters ? colors.white : colors.text.muted}
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

      {/* Sort Modal */}
      <Modal
        isOpen={sortMenuVisible}
        onClose={() => setSortMenuVisible(false)}
        title="Sırala"
      >
        <View>
          {SORT_OPTIONS.map((option) => {
            const isSelected = filters.sortBy === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={styles.sortOption}
                onPress={() => {
                  setFilters({ ...filters, sortBy: option.id });
                  setSortMenuVisible(false);
                }}
              >
                <Text style={styles.sortOptionText}>{option.name}</Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={20} color={colors.primary[600]!} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Brand Filter */}
            {BRANDS.slice(0, 6).map((brand) => (
              <View key={brand.id} style={styles.filterChipWrap}>
                <Chip
                  label={brand.name}
                  selected={filters.brand === brand.name}
                  variant="primary"
                  onPress={() => setFilters({ ...filters, brand: filters.brand === brand.name ? '' : brand.name })}
                />
              </View>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Scale Filter */}
            {SCALES.map((scale) => (
              <View key={scale.id} style={styles.filterChipWrap}>
                <Chip
                  label={scale.name}
                  selected={filters.scale === scale.id}
                  variant="primary"
                  onPress={() => setFilters({ ...filters, scale: filters.scale === scale.id ? '' : scale.id })}
                />
              </View>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Condition Filter */}
            {CONDITIONS.map((cond) => (
              <View key={cond.id} style={styles.filterChipWrap}>
                <Chip
                  label={cond.name}
                  selected={filters.condition === cond.id}
                  variant="primary"
                  onPress={() => setFilters({ ...filters, condition: filters.condition === cond.id ? '' : cond.id })}
                />
              </View>
            ))}

            {/* Trade Only */}
            <View style={styles.filterChipWrap}>
              <Chip
                label="Sadece Takas"
                selected={filters.tradeOnly}
                variant="primary"
                onPress={() => setFilters({ ...filters, tradeOnly: !filters.tradeOnly })}
              />
            </View>
          </ScrollView>

          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearFilters}>
              <Ionicons name="close-circle" size={16} color={colors.primary[600]!} />
              <Text style={styles.clearFiltersText}>Filtreleri Temizle</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Listings */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>İlanlar yükleniyor...</Text>
        </View>
      ) : !listings || listings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetag-outline" size={64} color={colors.text.subtle} />
          <Text style={styles.emptyTitle}>İlan bulunamadı</Text>
          <Text style={styles.emptySubtitle}>Farklı filtreler deneyebilirsiniz</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listingsContainer}
          contentContainerStyle={styles.listingsContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary[600]!]} />
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
    backgroundColor: colors.surface.alt,
  },
  header: {
    backgroundColor: colors.primary[600]!,
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
    color: colors.white,
  },
  searchSection: {
    backgroundColor: colors.surface.DEFAULT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  searchBar: {
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
    backgroundColor: colors.surface.alt,
  },
  sortButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: colors.text.muted,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  sortOptionText: {
    fontSize: 15,
    color: colors.text.heading,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  filterButtonActive: {
    backgroundColor: colors.primary[600]!,
  },
  filterButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: colors.text.muted,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: colors.primary[600]!,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterBadgeActive: {
    backgroundColor: colors.white,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  filterBadgeTextActive: {
    color: colors.primary[600]!,
  },
  filtersPanel: {
    backgroundColor: colors.surface.DEFAULT,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterChips: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChipWrap: {
    marginRight: 8,
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
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: colors.text.muted,
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
    color: colors.text.heading,
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.text.muted,
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
    color: colors.text.muted,
    marginBottom: 12,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: colors.black,
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
    backgroundColor: colors.surface.alt,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success[600]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.white,
  },
  productContent: {
    padding: 12,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 11,
    color: colors.text.muted,
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
    color: colors.primary[600]!,
  },
  conditionBadge: {
    fontSize: 10,
    color: colors.text.muted,
    backgroundColor: colors.surface.alt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
