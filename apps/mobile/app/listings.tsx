import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { theme, Text, Input, Chip, Spinner, Radio } from '@tarodan/ui-native';
import { useState, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from '../src/services/api';
import { getImageUrl as getImageUrlFromUtils } from '../src/utils/imageUrl';
import { asLabel } from '../src/utils/format';
import ProductFilterSheet from '../src/components/ProductFilterSheet';
import { useProductFilterOptions } from '../src/hooks/useProductFilterOptions';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  CONDITION_OPTIONS,
  buildListParams,
  countActiveFilters,
  extractListings,
  extractMeta,
  type ProductFilters,
} from '../src/utils/productFilters';

const { colors, spacing } = theme;
const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const PAGE_SIZE = 24;

const conditionLabel = (v: string) =>
  CONDITION_OPTIONS.find((c) => c.value === v)?.label || v;

export default function ListingsScreen() {
  const params = useLocalSearchParams<{
    brand?: string;
    scale?: string;
    categoryId?: string;
    category?: string;
    manufacturer?: string;
    search?: string;
  }>();

  const [filters, setFilters] = useState<ProductFilters>(() => ({
    ...EMPTY_FILTERS,
    search: params.search || '',
    brand: params.brand || '',
    scale: params.scale || '',
    categoryId: params.categoryId || '',
    category: params.category || '',
    manufacturer: params.manufacturer || '',
  }));

  const [searchQuery, setSearchQuery] = useState(filters.search);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  const options = useProductFilterOptions();

  const applySearch = () =>
    setFilters((prev) => ({ ...prev, search: searchQuery.trim() }));

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['listings', filters],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const listParams = buildListParams(filters, pageParam as number, PAGE_SIZE);
      const res = await productsApi.getAll(listParams);
      return {
        items: extractListings(res.data),
        meta: extractMeta(res.data, pageParam as number, PAGE_SIZE),
      };
    },
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });

  const listings: any[] = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.meta.total ?? 0;
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSearchQuery('');
  };

  const getSortLabel = () =>
    SORT_OPTIONS.find((o) => o.value === filters.sortBy)?.label || 'Sırala';

  // Aktif filtre çipleri
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.category) activeChips.push({ key: 'cat', label: filters.category, onRemove: () => setFilters({ ...filters, category: '', categoryId: '' }) });
  if (filters.brand) activeChips.push({ key: 'brand', label: filters.brand, onRemove: () => setFilters({ ...filters, brand: '', brandId: '', carModel: '', carModelId: '' }) });
  if (filters.carModel) activeChips.push({ key: 'model', label: filters.carModel, onRemove: () => setFilters({ ...filters, carModel: '', carModelId: '' }) });
  if (filters.manufacturer) activeChips.push({ key: 'manuf', label: filters.manufacturer, onRemove: () => setFilters({ ...filters, manufacturer: '', manufacturerId: '' }) });
  if (filters.scale) activeChips.push({ key: 'scale', label: filters.scale, onRemove: () => setFilters({ ...filters, scale: '' }) });
  if (filters.material) activeChips.push({ key: 'mat', label: filters.material, onRemove: () => setFilters({ ...filters, material: '' }) });
  if (filters.condition) activeChips.push({ key: 'cond', label: conditionLabel(filters.condition), onRemove: () => setFilters({ ...filters, condition: '' }) });
  if (filters.minPrice || filters.maxPrice) activeChips.push({ key: 'price', label: `₺${filters.minPrice || '0'} - ₺${filters.maxPrice || '∞'}`, onRemove: () => setFilters({ ...filters, minPrice: '', maxPrice: '' }) });
  if (filters.tradeOnly) activeChips.push({ key: 'trade', label: 'Takaslı', onRemove: () => setFilters({ ...filters, tradeOnly: false }) });
  if (filters.discountOnly) activeChips.push({ key: 'disc', label: 'İndirimli', onRemove: () => setFilters({ ...filters, discountOnly: false }) });
  if (filters.preOrder) activeChips.push({ key: 'pre', label: 'Ön Sipariş', onRemove: () => setFilters({ ...filters, preOrder: false }) });
  if (filters.limited) activeChips.push({ key: 'lim', label: 'Limited', onRemove: () => setFilters({ ...filters, limited: false }) });
  if (filters.set) activeChips.push({ key: 'set', label: 'Set', onRemove: () => setFilters({ ...filters, set: false }) });

  const renderProductCard = ({ item }: { item: any }) => {
    const isTradeEnabled = item.isTradeEnabled || item.trade_available || item.tradeAvailable;
    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => router.push(`/product/${item.id}`)}
      >
        <View style={styles.productImageContainer}>
          <Image source={{ uri: getImageUrlFromUtils(item.images) }} style={styles.productImage} />
          {isTradeEnabled && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color={colors.white} />
              <Text style={styles.tradeBadgeText}>Takas</Text>
            </View>
          )}
        </View>
        <View style={styles.productContent}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.productMeta}>
            {asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}
          </Text>
          <View style={styles.priceRow}>
            <Text style={styles.productPrice}>₺{item.price?.toLocaleString('tr-TR')}</Text>
            {item.condition && (
              <Text style={styles.conditionBadge}>{conditionLabel(item.condition)}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
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
          onSubmitEditing={applySearch}
          leftIconName="search"
          containerStyle={styles.searchBar}
        />
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.sortButton} onPress={() => setSortMenuVisible(true)}>
            <Ionicons name="swap-vertical" size={18} color={colors.text.muted} />
            <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
            <Ionicons name="options-outline" size={18} color={colors.text.muted} />
            <Text style={styles.filterButtonText}>Filtreler</Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <FlatList
          horizontal
          data={activeChips}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          renderItem={({ item }) => (
            <Chip label={`${item.label} ✕`} variant="primary" onPress={item.onRemove} />
          )}
          ListFooterComponent={
            <Chip label="Temizle ✕" variant="neutral" onPress={clearFilters} />
          }
        />
      )}

      {/* Sort Modal */}
      <Modal visible={sortMenuVisible} transparent animationType="slide" onRequestClose={() => setSortMenuVisible(false)}>
        <TouchableOpacity style={styles.sortBackdrop} activeOpacity={1} onPress={() => setSortMenuVisible(false)}>
          <View style={styles.sortSheet}>
            <View style={styles.sortHandle} />
            <Text variant="h2" style={styles.sortTitle}>Sırala</Text>
            {SORT_OPTIONS.map((option) => {
              const isSelected = filters.sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => {
                    setFilters({ ...filters, sortBy: option.value });
                    setSortMenuVisible(false);
                  }}
                >
                  <Text style={styles.sortOptionText}>{option.label}</Text>
                  <Radio checked={isSelected} onChange={() => {
                    setFilters({ ...filters, sortBy: option.value });
                    setSortMenuVisible(false);
                  }} />
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Filter Sheet */}
      <ProductFilterSheet
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        options={options}
        resultCount={total}
      />

      {/* Listings */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
          <Text style={styles.loadingText}>İlanlar yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          numColumns={2}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderProductCard}
          columnWrapperStyle={styles.listRow}
          contentContainerStyle={styles.listingsContent}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <Text style={styles.resultsCount}>{total} ilan bulundu</Text>
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing[4] }}>
                <Spinner size="md" color={colors.primary[600]!} />
              </View>
            ) : (
              <View style={{ height: 60 }} />
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="pricetag-outline" size={64} color={colors.text.subtle} />
              <Text style={styles.emptyTitle}>İlan bulunamadı</Text>
              <Text style={styles.emptySubtitle}>Farklı filtreler deneyebilirsiniz</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.alt },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.white },
  searchSection: {
    backgroundColor: colors.surface.DEFAULT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  searchBar: { marginBottom: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  sortButtonText: { marginLeft: 6, fontSize: 13, color: colors.text.muted },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surface.alt,
  },
  filterButtonText: { marginLeft: 6, fontSize: 13, color: colors.text.muted },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: colors.primary[600]!,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  filterBadgeText: { fontSize: 11, fontWeight: 'bold', color: colors.white },
  chipsRow: { backgroundColor: colors.surface.DEFAULT, maxHeight: 56, flexGrow: 0 },
  chipsContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: 'center' },
  sortBackdrop: { flex: 1, backgroundColor: colors.overlay.black50, justifyContent: 'flex-end' },
  sortSheet: {
    backgroundColor: colors.surface.DEFAULT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sortHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border.DEFAULT,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text.heading, marginBottom: 8 },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  sortOptionText: { fontSize: 15, color: colors.text.heading },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: colors.text.muted },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, paddingTop: 80 },
  emptyTitle: { marginTop: 16, fontSize: 18, fontWeight: 'bold', color: colors.text.heading },
  emptySubtitle: { marginTop: 8, fontSize: 14, color: colors.text.muted, textAlign: 'center' },
  listingsContent: { padding: 16 },
  listRow: { justifyContent: 'space-between' },
  resultsCount: { fontSize: 13, color: colors.text.muted, marginBottom: 12 },
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
  productImageContainer: { position: 'relative' },
  productImage: { width: '100%', height: CARD_WIDTH * 0.9, backgroundColor: colors.surface.alt },
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
  tradeBadgeText: { marginLeft: 4, fontSize: 11, fontWeight: 'bold', color: colors.white },
  productContent: { padding: 12 },
  productTitle: { fontSize: 13, fontWeight: '600', color: colors.text.heading, marginBottom: 4 },
  productMeta: { fontSize: 11, color: colors.text.muted, marginBottom: 8 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productPrice: { fontSize: 16, fontWeight: 'bold', color: colors.primary[600]! },
  conditionBadge: {
    fontSize: 10,
    color: colors.text.muted,
    backgroundColor: colors.surface.alt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
