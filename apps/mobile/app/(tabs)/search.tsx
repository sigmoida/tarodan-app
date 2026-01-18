import { useState, useMemo, useCallback } from 'react';
import { View, FlatList, Dimensions, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput as RNTextInput } from 'react-native';
import { Text, Card, Searchbar, Chip, ActivityIndicator, Button, IconButton, Divider, RadioButton, Checkbox, TextInput } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { TarodanColors, SCALES, BRANDS, CONDITIONS } from '../../src/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const SORT_OPTIONS = [
  { value: 'newest', label: 'En Yeni', icon: 'time-outline' },
  { value: 'price_asc', label: 'Fiyat (Düşük)', icon: 'arrow-up' },
  { value: 'price_desc', label: 'Fiyat (Yüksek)', icon: 'arrow-down' },
  { value: 'popular', label: 'Popüler', icon: 'star-outline' },
];

export default function SearchScreen() {
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState((params.q as string) || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [sortBy, setSortBy] = useState('newest');
  const [category, setCategory] = useState((params.category as string) || '');
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    params.brand ? [params.brand as string] : []
  );
  const [selectedScales, setSelectedScales] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [tradeOnly, setTradeOnly] = useState(false);
  
  // Modal states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Debounce search
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    const timer = setTimeout(() => {
      setDebouncedQuery(text);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const queryParams = useMemo(() => ({
    q: debouncedQuery,
    sort: sortBy,
    category,
    brand: selectedBrands.join(','),
    scale: selectedScales.join(','),
    condition: selectedConditions.join(','),
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < 50000 ? priceRange[1] : undefined,
    tradeAvailable: tradeOnly || undefined,
  }), [debouncedQuery, sortBy, category, selectedBrands, selectedScales, selectedConditions, priceRange, tradeOnly]);

  const { data: results, isLoading, refetch } = useQuery({
    queryKey: ['products', queryParams],
    queryFn: () => api.get('/products', { params: queryParams }).then(res => res.data),
  });

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setCategory('');
    setSelectedBrands([]);
    setSelectedScales([]);
    setSelectedConditions([]);
    setPriceRange([0, 50000]);
    setTradeOnly(false);
    setSortBy('newest');
  };

  const toggleBrand = (brandId: string) => {
    setSelectedBrands(prev => 
      prev.includes(brandId) 
        ? prev.filter(b => b !== brandId) 
        : [...prev, brandId]
    );
  };

  const toggleScale = (scaleId: string) => {
    setSelectedScales(prev => 
      prev.includes(scaleId) 
        ? prev.filter(s => s !== scaleId) 
        : [...prev, scaleId]
    );
  };

  const toggleCondition = (conditionId: string) => {
    setSelectedConditions(prev => 
      prev.includes(conditionId) 
        ? prev.filter(c => c !== conditionId) 
        : [...prev, conditionId]
    );
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedBrands.length) count++;
    if (selectedScales.length) count++;
    if (selectedConditions.length) count++;
    if (priceRange[0] > 0 || priceRange[1] < 50000) count++;
    if (tradeOnly) count++;
    if (category) count++;
    return count;
  }, [selectedBrands, selectedScales, selectedConditions, priceRange, tradeOnly, category]);

  const renderProduct = ({ item }: { item: any }) => (
    <Card
      style={styles.productCard}
      onPress={() => handleProductPress(item.id)}
    >
      <Card.Cover
        source={{ uri: item.images?.[0] || 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün' }}
        style={styles.productImage}
      />
      {item.tradeAvailable && (
        <View style={styles.tradeBadge}>
          <Ionicons name="swap-horizontal" size={12} color="#fff" />
          <Text style={styles.tradeBadgeText}>Takas</Text>
        </View>
      )}
      {item.condition === 'new' && (
        <View style={[styles.conditionBadge, { backgroundColor: TarodanColors.badgeNew }]}>
          <Text style={styles.conditionBadgeText}>Sıfır</Text>
        </View>
      )}
      <Card.Content style={styles.productContent}>
        <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.productMeta}>
          {item.brand} • {item.scale}
        </Text>
        <Text style={styles.productPrice}>
          ₺{item.price?.toLocaleString('tr-TR')}
        </Text>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ara</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Model, marka veya anahtar kelime..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={TarodanColors.textSecondary}
        />
      </View>

      {/* Filter & Sort Row */}
      <View style={styles.filterRow}>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="filter-outline" size={20} color={TarodanColors.textPrimary} />
          <Text style={styles.filterButtonText}>Filtrele</Text>
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setSortModalVisible(true)}
        >
          <Ionicons name="swap-vertical-outline" size={20} color={TarodanColors.textPrimary} />
          <Text style={styles.filterButtonText}>
            {SORT_OPTIONS.find(s => s.value === sortBy)?.label || 'Sırala'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Filters */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.quickFilters}
        contentContainerStyle={styles.quickFiltersContent}
      >
        <Chip
          mode={tradeOnly ? 'flat' : 'outlined'}
          selected={tradeOnly}
          onPress={() => setTradeOnly(!tradeOnly)}
          style={[styles.quickChip, tradeOnly && styles.quickChipActive]}
          textStyle={tradeOnly ? styles.quickChipTextActive : undefined}
          icon={tradeOnly ? 'check' : 'swap-horizontal'}
        >
          Takaslı
        </Chip>
        {selectedBrands.map(brandId => {
          const brand = BRANDS.find(b => b.id === brandId);
          return (
            <Chip 
              key={brandId}
              onClose={() => toggleBrand(brandId)}
              style={styles.activeChip}
            >
              {brand?.name || brandId}
            </Chip>
          );
        })}
        {selectedScales.map(scaleId => (
          <Chip 
            key={scaleId}
            onClose={() => toggleScale(scaleId)}
            style={styles.activeChip}
          >
            {scaleId}
          </Chip>
        ))}
        {(priceRange[0] > 0 || priceRange[1] < 50000) && (
          <Chip 
            onClose={() => setPriceRange([0, 50000])}
            style={styles.activeChip}
          >
            ₺{priceRange[0].toLocaleString('tr-TR')} - ₺{priceRange[1].toLocaleString('tr-TR')}
          </Chip>
        )}
        {activeFiltersCount > 0 && (
          <Chip 
            mode="outlined" 
            onPress={clearAllFilters}
            icon="close"
          >
            Temizle
          </Chip>
        )}
      </ScrollView>

      {/* Results Count */}
      <View style={styles.resultsCount}>
        <Text style={styles.resultsCountText}>
          {isLoading ? 'Aranıyor...' : `${results?.total || 0} sonuç bulundu`}
        </Text>
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TarodanColors.primary} />
          <Text style={styles.loadingText}>Sonuçlar yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={results?.data || []}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.listRow}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderProduct}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={64} color={TarodanColors.textLight} />
              <Text style={styles.emptyTitle}>Sonuç Bulunamadı</Text>
              <Text style={styles.emptySubtitle}>
                Farklı anahtar kelimeler veya filtreler deneyin
              </Text>
              <Button 
                mode="outlined" 
                onPress={clearAllFilters}
                style={{ marginTop: 16 }}
              >
                Filtreleri Temizle
              </Button>
            </View>
          }
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filtreler</Text>
            <IconButton
              icon="close"
              size={24}
              onPress={() => setFilterModalVisible(false)}
            />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Price Range */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Fiyat Aralığı</Text>
              
              {/* Quick Price Presets */}
              <View style={styles.pricePresets}>
                <Chip
                  mode={priceRange[0] === 0 && priceRange[1] === 50000 ? 'flat' : 'outlined'}
                  selected={priceRange[0] === 0 && priceRange[1] === 50000}
                  onPress={() => setPriceRange([0, 50000])}
                  style={styles.pricePresetChip}
                >
                  Tümü
                </Chip>
                <Chip
                  mode={priceRange[0] === 0 && priceRange[1] === 500 ? 'flat' : 'outlined'}
                  selected={priceRange[0] === 0 && priceRange[1] === 500}
                  onPress={() => setPriceRange([0, 500])}
                  style={styles.pricePresetChip}
                >
                  ₺0-500
                </Chip>
                <Chip
                  mode={priceRange[0] === 500 && priceRange[1] === 1000 ? 'flat' : 'outlined'}
                  selected={priceRange[0] === 500 && priceRange[1] === 1000}
                  onPress={() => setPriceRange([500, 1000])}
                  style={styles.pricePresetChip}
                >
                  ₺500-1K
                </Chip>
                <Chip
                  mode={priceRange[0] === 1000 && priceRange[1] === 5000 ? 'flat' : 'outlined'}
                  selected={priceRange[0] === 1000 && priceRange[1] === 5000}
                  onPress={() => setPriceRange([1000, 5000])}
                  style={styles.pricePresetChip}
                >
                  ₺1K-5K
                </Chip>
                <Chip
                  mode={priceRange[0] === 5000 && priceRange[1] === 50000 ? 'flat' : 'outlined'}
                  selected={priceRange[0] === 5000 && priceRange[1] === 50000}
                  onPress={() => setPriceRange([5000, 50000])}
                  style={styles.pricePresetChip}
                >
                  ₺5K+
                </Chip>
              </View>
              
              {/* Custom Range Inputs */}
              <View style={styles.priceInputs}>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.priceInputLabel}>Min</Text>
                  <TextInput
                    mode="outlined"
                    value={priceRange[0].toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 0;
                      setPriceRange([value, priceRange[1]]);
                    }}
                    keyboardType="numeric"
                    style={styles.priceInput}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                    left={<TextInput.Affix text="₺" />}
                  />
                </View>
                <Text style={styles.priceInputDivider}>-</Text>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.priceInputLabel}>Max</Text>
                  <TextInput
                    mode="outlined"
                    value={priceRange[1].toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 50000;
                      setPriceRange([priceRange[0], value]);
                    }}
                    keyboardType="numeric"
                    style={styles.priceInput}
                    outlineColor={TarodanColors.border}
                    activeOutlineColor={TarodanColors.primary}
                    left={<TextInput.Affix text="₺" />}
                  />
                </View>
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Brands */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Markalar</Text>
              <View style={styles.chipGrid}>
                {BRANDS.map(brand => (
                  <Chip
                    key={brand.id}
                    mode={selectedBrands.includes(brand.id) ? 'flat' : 'outlined'}
                    selected={selectedBrands.includes(brand.id)}
                    onPress={() => toggleBrand(brand.id)}
                    style={[
                      styles.filterChip,
                      selectedBrands.includes(brand.id) && styles.filterChipSelected
                    ]}
                  >
                    {brand.name}
                  </Chip>
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Scales */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Ölçek</Text>
              <View style={styles.chipGrid}>
                {SCALES.map(scale => (
                  <Chip
                    key={scale.id}
                    mode={selectedScales.includes(scale.id) ? 'flat' : 'outlined'}
                    selected={selectedScales.includes(scale.id)}
                    onPress={() => toggleScale(scale.id)}
                    style={[
                      styles.filterChip,
                      selectedScales.includes(scale.id) && styles.filterChipSelected
                    ]}
                  >
                    {scale.id}
                  </Chip>
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Condition */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Durum</Text>
              <View style={styles.chipGrid}>
                {CONDITIONS.map(condition => (
                  <Chip
                    key={condition.id}
                    mode={selectedConditions.includes(condition.id) ? 'flat' : 'outlined'}
                    selected={selectedConditions.includes(condition.id)}
                    onPress={() => toggleCondition(condition.id)}
                    style={[
                      styles.filterChip,
                      selectedConditions.includes(condition.id) && { backgroundColor: condition.color }
                    ]}
                    textStyle={selectedConditions.includes(condition.id) ? { color: '#fff' } : undefined}
                  >
                    {condition.name}
                  </Chip>
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Trade Filter */}
            <TouchableOpacity 
              style={styles.checkboxRow}
              onPress={() => setTradeOnly(!tradeOnly)}
            >
              <Checkbox
                status={tradeOnly ? 'checked' : 'unchecked'}
                onPress={() => setTradeOnly(!tradeOnly)}
                color={TarodanColors.primary}
              />
              <Text style={styles.checkboxLabel}>Sadece Takas Yapılabilir</Text>
            </TouchableOpacity>

            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button 
              mode="outlined" 
              onPress={clearAllFilters}
              style={styles.modalButton}
            >
              Temizle
            </Button>
            <Button 
              mode="contained" 
              onPress={() => setFilterModalVisible(false)}
              buttonColor={TarodanColors.primary}
              style={[styles.modalButton, { flex: 2 }]}
            >
              {results?.total || 0} Sonuç Göster
            </Button>
          </View>
        </View>
      </Modal>

      {/* Sort Modal */}
      <Modal
        visible={sortModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.sortModalBackdrop}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={styles.sortModalContent}>
            <View style={styles.sortModalHandle} />
            <Text style={styles.sortModalTitle}>Sıralama</Text>
            <RadioButton.Group onValueChange={value => { setSortBy(value); setSortModalVisible(false); }} value={sortBy}>
              {SORT_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => { setSortBy(option.value); setSortModalVisible(false); }}
                >
                  <Ionicons 
                    name={option.icon as any} 
                    size={20} 
                    color={sortBy === option.value ? TarodanColors.primary : TarodanColors.textSecondary} 
                  />
                  <Text style={[
                    styles.sortOptionText,
                    sortBy === option.value && styles.sortOptionTextActive
                  ]}>
                    {option.label}
                  </Text>
                  <RadioButton value={option.value} color={TarodanColors.primary} />
                </TouchableOpacity>
              ))}
            </RadioButton.Group>
          </View>
        </TouchableOpacity>
      </Modal>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: TarodanColors.textOnPrimary,
  },
  searchSection: {
    padding: 16,
    backgroundColor: TarodanColors.background,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
    borderRadius: 12,
  },
  searchInput: {
    fontSize: 16,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TarodanColors.background,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 8,
    backgroundColor: TarodanColors.surfaceVariant,
    borderRadius: 8,
  },
  filterButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: TarodanColors.textPrimary,
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: TarodanColors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickFilters: {
    backgroundColor: TarodanColors.background,
    maxHeight: 56,
  },
  quickFiltersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  quickChip: {
    marginRight: 8,
  },
  quickChipActive: {
    backgroundColor: TarodanColors.primary,
  },
  quickChipTextActive: {
    color: '#fff',
  },
  activeChip: {
    marginRight: 8,
    backgroundColor: TarodanColors.primaryLight,
  },
  resultsCount: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: TarodanColors.backgroundSecondary,
  },
  resultsCountText: {
    fontSize: 13,
    color: TarodanColors.textSecondary,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  listRow: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: TarodanColors.background,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  productImage: {
    height: CARD_WIDTH,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  conditionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conditionBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  productContent: {
    paddingVertical: 12,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TarodanColors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: TarodanColors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: TarodanColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: TarodanColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
    marginBottom: 12,
  },
  pricePresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pricePresetChip: {
    marginBottom: 4,
  },
  priceInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInputContainer: {
    flex: 1,
  },
  priceInputLabel: {
    fontSize: 12,
    color: TarodanColors.textSecondary,
    marginBottom: 4,
  },
  priceInput: {
    backgroundColor: TarodanColors.background,
    height: 44,
  },
  priceInputDivider: {
    fontSize: 18,
    color: TarodanColors.textSecondary,
    marginHorizontal: 12,
    marginTop: 20,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    marginBottom: 4,
  },
  filterChipSelected: {
    backgroundColor: TarodanColors.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkboxLabel: {
    fontSize: 16,
    color: TarodanColors.textPrimary,
    marginLeft: 8,
  },
  divider: {
    marginVertical: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
  },
  // Sort Modal
  sortModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sortModalContent: {
    backgroundColor: TarodanColors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sortModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: TarodanColors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TarodanColors.textPrimary,
    marginBottom: 16,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sortOptionText: {
    flex: 1,
    fontSize: 16,
    color: TarodanColors.textPrimary,
    marginLeft: 12,
  },
  sortOptionTextActive: {
    color: TarodanColors.primary,
    fontWeight: '600',
  },
});
