import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, FlatList, Dimensions, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput as RNTextInput, Image } from 'react-native';
import { Text, Searchbar, Chip, ActivityIndicator, Button, IconButton, Divider, RadioButton, Checkbox, TextInput } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { productsApi, searchApi } from '../../src/services/api';
import { TarodanColors, SCALES, BRANDS, CONDITIONS } from '../../src/theme';
import { useRecentSearchesStore } from '../../src/stores/recentSearchesStore';
import { getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { safeString } from '../../src/utils/safeString';
import { isProductTradeOpen } from '../../src/utils/isProductTradeOpen';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 28) / 2;

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
  const [category, setCategory] = useState((params.categoryId as string) || (params.category as string) || '');
  const [selectedBrands, setSelectedBrands] = useState<string[]>(
    params.brand ? [params.brand as string] : []
  );
  const [manufacturer, setManufacturer] = useState((params.manufacturer as string) || '');
  const [selectedScales, setSelectedScales] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [tradeOnly, setTradeOnly] = useState(false);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  
  // Modal states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Recent searches store
  const { searches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();
  const recentSearchQueries = searches.map((s) => s.query);

  // Akıllı arama önerileri (web ile aynı)
  const { data: autocompleteData } = useQuery({
    queryKey: ['autocomplete-rich', debouncedQuery],
    queryFn: async () => {
      try {
        const res = await searchApi.autocompleteRich(debouncedQuery);
        return res.data?.data || res.data || {};
      } catch {
        return {};
      }
    },
    enabled: debouncedQuery.length >= 1,
    staleTime: 60000,
  });

  const suggestionItems = useMemo(() => {
    if (!autocompleteData || debouncedQuery.length < 1) return [];
    const items: Array<{ type: string; id: string; label: string; route: string }> = [];
    (autocompleteData.products || []).slice(0, 5).forEach((p: any) =>
      items.push({ type: 'product', id: p.id, label: p.title || p.name, route: `/product/${p.id}` })
    );
    (autocompleteData.brands || []).slice(0, 4).forEach((b: any) =>
      items.push({ type: 'brand', id: b.id || b.name, label: b.name, route: `/(tabs)/search?brand=${encodeURIComponent(b.name)}` })
    );
    (autocompleteData.categories || []).slice(0, 4).forEach((c: any) =>
      items.push({ type: 'category', id: c.id, label: c.name, route: `/(tabs)/search?categoryId=${c.id}` })
    );
    (autocompleteData.manufacturers || []).slice(0, 4).forEach((m: any) =>
      items.push({ type: 'manufacturer', id: m.id || m.name, label: m.name, route: `/(tabs)/search?q=${encodeURIComponent(m.name)}` })
    );
    (autocompleteData.scales || []).slice(0, 3).forEach((s: string) =>
      items.push({ type: 'scale', id: s, label: s, route: `/(tabs)/search?scale=${encodeURIComponent(s)}` })
    );
    (autocompleteData.suggestions || []).slice(0, 5).forEach((s: string, idx: number) =>
      items.push({ type: 'search', id: `sg-${idx}`, label: s, route: `/(tabs)/search?q=${encodeURIComponent(s)}` })
    );
    items.push({ type: 'search', id: '__all__', label: `"${debouncedQuery}" ile ara`, route: `/(tabs)/search?q=${encodeURIComponent(debouncedQuery)}` });
    return items;
  }, [autocompleteData, debouncedQuery]);

  useEffect(() => {
    if (params.q && params.q !== searchQuery) {
      setSearchQuery(params.q as string);
      setDebouncedQuery(params.q as string);
    }
    if (params.categoryId) setCategory(params.categoryId as string);
    if (params.brand) setSelectedBrands([params.brand as string]);
    if (params.scale) setSelectedScales([params.scale as string]);
    if (params.manufacturer !== undefined) {
      setManufacturer((params.manufacturer as string) || '');
    }
  }, [params.q, params.categoryId, params.brand, params.scale, params.manufacturer]);

  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= 2) {
      addSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  // Debounce search
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    setShowRecentSearches(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(text);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Handle recent search selection
  const handleRecentSearchSelect = (query: string) => {
    setSearchQuery(query);
    setDebouncedQuery(query);
    setShowRecentSearches(false);
  };

  const queryParams = useMemo(() => {
    // Sadece değeri olan parametreleri gönder - boş string API'de 400 hatası veriyor
    const params: Record<string, any> = {};
    
    if (debouncedQuery) {
      params.q = debouncedQuery;
      params.search = debouncedQuery;
    }
    if (sortBy) {
      params.sort = sortBy;
      params.sortBy =
        sortBy === 'newest'
          ? 'created_desc'
          : sortBy === 'price_asc'
            ? 'price_asc'
            : sortBy === 'price_desc'
              ? 'price_desc'
              : 'created_desc';
    }
    if (category) params.category = category;
    if (selectedBrands.length > 0) params.brand = selectedBrands.join(',');
    if (manufacturer.trim()) params.manufacturer = manufacturer.trim();
    if (selectedScales.length > 0) params.scale = selectedScales.join(',');
    if (selectedConditions.length > 0) params.condition = selectedConditions.join(',');
    if (priceRange[0] > 0) params.minPrice = priceRange[0];
    if (priceRange[1] < 50000) params.maxPrice = priceRange[1];
    if (tradeOnly) params.tradeAvailable = true;
    
    return params;
  }, [debouncedQuery, sortBy, category, selectedBrands, selectedScales, selectedConditions, priceRange, tradeOnly, manufacturer]);

  // Elasticsearch veya normal ürün arama
  const { data: products, isLoading, refetch, error } = useQuery({
    queryKey: ['products', queryParams],
    queryFn: async () => {
      console.log('🔍 Search API çağrılıyor, params:', JSON.stringify(queryParams));
      try {
        let data = [];
        
        // Üretici filtresi varken ES üreticiyi bilmediği için REST /products kullan
        if (debouncedQuery && debouncedQuery.length >= 2 && !manufacturer.trim()) {
          console.log('🔍 Using Elasticsearch search for:', debouncedQuery);
          const searchParams = {
            q: debouncedQuery,
            categoryId: category || undefined,
            minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
            maxPrice: priceRange[1] < 50000 ? priceRange[1] : undefined,
            condition: selectedConditions.length > 0 ? selectedConditions[0] : undefined,
            sortBy: sortBy === 'newest' ? 'newest' : sortBy === 'price_asc' ? 'price_asc' : sortBy === 'price_desc' ? 'price_desc' : 'relevance',
            pageSize: 50,
          };
          
          const res = await searchApi.products(searchParams);
          // Elasticsearch yanıtı: { results: [...], total, page, pageSize, took }
          data = res.data?.results || res.data?.data || [];
          console.log('🔍 Elasticsearch results:', data.length);
        } else {
          // Normal ürün listesi
          const res = await productsApi.getAll(queryParams);
          
          // API response parsing
          if (Array.isArray(res.data)) {
            data = res.data;
          } else if (res.data?.data && Array.isArray(res.data.data)) {
            data = res.data.data;
          } else if (res.data?.products && Array.isArray(res.data.products)) {
            data = res.data.products;
          } else if (res.data?.items && Array.isArray(res.data.items)) {
            data = res.data.items;
          }
        }
        
        // Trade-only filter (client-side)
        if (tradeOnly) {
          data = data.filter((p: any) => p.tradeAvailable || p.isTradeEnabled);
        }
        
        console.log('🔍 Final products count:', data.length);
        return data;
      } catch (err: any) {
        console.log('❌ Search API error:', err.message);
        // Fallback to normal products API if elasticsearch fails
        try {
          const res = await productsApi.getAll(queryParams);
          return res.data?.data || res.data?.products || res.data || [];
        } catch {
          return [];
        }
      }
    },
  });

  // Log state changes
  console.log('📊 Current state - products:', products?.length || 0, 'isLoading:', isLoading, 'error:', error?.message);

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setCategory('');
    setSelectedBrands([]);
    setManufacturer('');
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

  const renderProduct = ({ item }: { item: any }) => {
    const imageUrl = getImageUrlFromUtils(item.images);
    const viewCount = item.viewCount || item.views || 0;
    const likeCount = item.likeCount || item.likes || 0;
    const tradeOpen = isProductTradeOpen(item);

    return (
    <TouchableOpacity
      style={styles.productCard}
      activeOpacity={0.85}
      onPress={() => handleProductPress(item.id)}
    >
      <View style={styles.productImageWrap}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.productImage}
          resizeMode="cover"
        />
        {tradeOpen && (
          <View style={styles.tradeBadge}>
            <Ionicons name="swap-horizontal" size={12} color="#fff" />
            <Text style={styles.tradeBadgeText}>Takas Açık</Text>
          </View>
        )}
        {item.condition === 'new' && (
          <View style={[styles.conditionBadge, { backgroundColor: TarodanColors.badgeNew }]}>
            <Text style={styles.conditionBadgeText}>Sıfır</Text>
          </View>
        )}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="eye-outline" size={12} color={TarodanColors.textSecondary} />
            <Text style={styles.statText}>{viewCount}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="heart-outline" size={12} color={TarodanColors.textSecondary} />
            <Text style={styles.statText}>{likeCount}</Text>
          </View>
        </View>
      </View>
      <View style={styles.productContent}>
        <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.productMeta}>
          {safeString(item.brand, 'Marka')} • {safeString(item.scale, '1:64')}
        </Text>
        <Text style={styles.productPrice}>
          ₺{(item.price ?? 0).toLocaleString('tr-TR')}
        </Text>
      </View>
    </TouchableOpacity>
  );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
          <Image 
            source={require('../../assets/tarodan-logo.jpg')} 
            style={{ width: 130, height: 42 }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Searchbar
          placeholder="Model, marka veya anahtar kelime..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          onSubmitEditing={() => setDebouncedQuery(searchQuery.trim())}
          onIconPress={() => {
            setShowRecentSearches(true);
            setDebouncedQuery(searchQuery.trim());
          }}
          onFocus={() => setShowRecentSearches(true)}
          onBlur={() => setTimeout(() => setShowRecentSearches(false), 1200)}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor={TarodanColors.textSecondary}
        />
        
        {/* Recent Searches / Akıllı öneriler */}
        {showRecentSearches && !searchQuery && recentSearchQueries.length > 0 && (
          <View style={styles.recentSearchesDropdown}>
            <View style={styles.recentSearchesHeader}>
              <Text style={styles.recentSearchesTitle}>Son Aramalar</Text>
              <TouchableOpacity onPress={clearSearches}>
                <Text style={styles.clearRecentText}>Temizle</Text>
              </TouchableOpacity>
            </View>
            {recentSearchQueries.map((query, index) => (
              <TouchableOpacity
                key={index}
                style={styles.recentSearchItem}
                onPress={() => handleRecentSearchSelect(query)}
              >
                <Ionicons name="time-outline" size={18} color={TarodanColors.textSecondary} />
                <Text style={styles.recentSearchText}>{query}</Text>
                <TouchableOpacity
                  onPress={() => removeSearch(query)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color={TarodanColors.textLight} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            <View style={styles.suggestionsSection}>
              <Text style={styles.suggestionsSectionTitle}>Popüler aramalar</Text>
              <View style={styles.popularChips}>
                {['Hot Wheels', '1:18 ölçek', 'Ferrari', 'Matchbox', 'Porsche'].map((q) => (
                  <Chip key={q} style={styles.popularChip} onPress={() => handleRecentSearchSelect(q)} compact>
                    {q}
                  </Chip>
                ))}
              </View>
            </View>
          </View>
        )}
        {/* Akıllı arama önerileri (yazarken) */}
        {showRecentSearches && debouncedQuery.length >= 1 && suggestionItems.length > 0 && (
          <View style={styles.recentSearchesDropdown}>
            <View style={styles.recentSearchesHeader}>
              <Text style={styles.recentSearchesTitle}>Öneriler</Text>
            </View>
            {suggestionItems.map((item) => (
              <TouchableOpacity
                key={item.id + item.label}
                style={styles.recentSearchItem}
                onPress={() => {
                  addSearch(debouncedQuery);
                  setShowRecentSearches(false);
                  router.push(item.route as any);
                }}
              >
                <Ionicons
                  name={item.type === 'product' ? 'car-outline' : item.type === 'search' ? 'search-outline' : 'pricetag-outline'}
                  size={18}
                  color={TarodanColors.textSecondary}
                />
                <Text style={styles.recentSearchText} numberOfLines={1}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={TarodanColors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
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
          {isLoading ? 'Aranıyor...' : `${products?.length || 0} sonuç bulundu`}
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
          data={products || []}
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
              {products?.length || 0} Sonuç Göster
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
    paddingBottom: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchSection: {
    padding: 16,
    backgroundColor: TarodanColors.background,
    position: 'relative',
    zIndex: 10,
  },
  recentSearchesDropdown: {
    position: 'absolute',
    top: '100%',
    left: 16,
    right: 16,
    backgroundColor: TarodanColors.background,
    borderRadius: 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 100,
    marginTop: -8,
    borderWidth: 1,
    borderColor: TarodanColors.border,
  },
  recentSearchesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  recentSearchesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TarodanColors.textPrimary,
  },
  clearRecentText: {
    fontSize: 13,
    color: TarodanColors.primary,
    fontWeight: '500',
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TarodanColors.border,
  },
  recentSearchText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: TarodanColors.textPrimary,
  },
  suggestionsSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: TarodanColors.border,
  },
  suggestionsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: TarodanColors.textTertiary,
    marginBottom: 8,
  },
  popularChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  popularChip: {
    marginRight: 0,
  },
  searchBar: {
    backgroundColor: TarodanColors.surfaceVariant,
    elevation: 0,
    borderRadius: 0,
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
    borderRadius: 0,
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
    borderRadius: 0,
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
    minHeight: 56,
  },
  quickFiltersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  quickChip: {
    marginRight: 8,
    height: 36,
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
    padding: 8,
    paddingTop: 6,
  },
  listRow: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: CARD_WIDTH,
    marginBottom: 8,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: TarodanColors.background,
    elevation: 0,
    shadowOpacity: 0,
  },
  productImageWrap: {
    width: '100%',
    height: CARD_WIDTH,
    position: 'relative',
    backgroundColor: TarodanColors.backgroundSecondary,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
    borderRadius: 0,
  },
  tradeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TarodanColors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 0,
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
    borderRadius: 0,
  },
  conditionBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsRow: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statText: {
    fontSize: 11,
    color: TarodanColors.textSecondary,
  },
  productContent: {
    paddingHorizontal: 16,
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
    borderRadius: 0,
  },
  // Sort Modal
  sortModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sortModalContent: {
    backgroundColor: TarodanColors.background,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    padding: 20,
    paddingBottom: 40,
  },
  sortModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: TarodanColors.border,
    borderRadius: 0,
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
