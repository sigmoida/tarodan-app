import { useState, useMemo, useCallback, useEffect } from 'react';
import { View, FlatList, Dimensions, StyleSheet, TouchableOpacity, ScrollView, Modal, Image, Pressable, TextInput as RNTextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Input,
  Radio,
  Spinner,
  Text,
  theme,
} from '@tarodan/ui-native';
import { productsApi, searchApi } from '../../src/services/api';
import { SCALES, BRANDS, CONDITIONS } from '../../src/theme';
import { useRecentSearchesStore } from '../../src/stores/recentSearchesStore';
import { getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { asLabel } from '../../src/utils/format';

const { colors, spacing, radius } = theme;

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
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  
  // Modal states
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Recent searches store
  const { searches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();
  const recentSearchQueries = searches.map((s) => s.query);

  // Web `Navbar.tsx:223` paritesi: autocompleteRich. Kullanıcı yazdıkça öneri listesi.
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const q = searchQuery.trim();
      setAutocompleteQuery(q.length >= 2 ? q : '');
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const autocompleteQueryRes = useQuery({
    queryKey: ['autocomplete-rich', autocompleteQuery],
    queryFn: async () => {
      if (!autocompleteQuery) return null;
      try {
        const response = await searchApi.autocompleteRich(autocompleteQuery);
        return response.data;
      } catch {
        return null;
      }
    },
    enabled: !!autocompleteQuery,
  });
  const autocomplete = autocompleteQueryRes.data;

  // Save search when user submits
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= 2) {
      addSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  // Debounce search
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
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
    
    if (debouncedQuery) params.q = debouncedQuery;
    if (sortBy) params.sort = sortBy;
    if (category) params.category = category;
    if (selectedBrands.length > 0) params.brand = selectedBrands.join(',');
    if (selectedScales.length > 0) params.scale = selectedScales.join(',');
    if (selectedConditions.length > 0) params.condition = selectedConditions.join(',');
    if (priceRange[0] > 0) params.minPrice = priceRange[0];
    if (priceRange[1] < 50000) params.maxPrice = priceRange[1];
    if (tradeOnly) params.tradeAvailable = true;
    
    return params;
  }, [debouncedQuery, sortBy, category, selectedBrands, selectedScales, selectedConditions, priceRange, tradeOnly]);

  // Elasticsearch veya normal ürün arama
  const { data: products, isLoading, refetch, error } = useQuery({
    queryKey: ['products', queryParams],
    queryFn: async () => {
      console.log('🔍 Search API çağrılıyor, params:', JSON.stringify(queryParams));
      try {
        let data = [];
        
        // Eğer arama sorgusu varsa Elasticsearch kullan
        if (debouncedQuery && debouncedQuery.length >= 2) {
          console.log('🔍 Using Elasticsearch search for:', debouncedQuery);
          const resolvedSort: 'relevance' | 'price_asc' | 'price_desc' | 'newest' =
            sortBy === 'newest' ? 'newest'
            : sortBy === 'price_asc' ? 'price_asc'
            : sortBy === 'price_desc' ? 'price_desc'
            : 'relevance';
          const searchParams = {
            q: debouncedQuery,
            categoryId: category || undefined,
            minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
            maxPrice: priceRange[1] < 50000 ? priceRange[1] : undefined,
            condition: selectedConditions.length > 0 ? selectedConditions[0] : undefined,
            sortBy: resolvedSort,
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
    // Image URL extraction - handle both string and object formats with URL transformation
    const imageUrl = getImageUrlFromUtils(item.images);
    
    return (
      <Pressable
        onPress={() => handleProductPress(item.id)}
        style={({ pressed }) => [styles.productCardWrapper, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Card style={styles.productCard} padding={0}>
          <Image source={{ uri: imageUrl }} style={styles.productImage} resizeMode="cover" />
          {item.tradeAvailable && (
            <View style={styles.tradeBadge}>
              <Ionicons name="swap-horizontal" size={12} color={colors.white} />
              <Text variant="caption" tone="inverted" weight="bold">
                Takas
              </Text>
            </View>
          )}
          {item.condition === 'new' && (
            <View style={[styles.conditionBadge, { backgroundColor: colors.success[600]! }]}>
              <Text variant="caption" tone="inverted" weight="bold">
                Sıfır
              </Text>
            </View>
          )}
          <View style={styles.productContent}>
            <Text variant="bodySm" weight="semibold" numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}
            </Text>
            <Text variant="h3" tone="primary" style={{ marginTop: 4 }}>
              ₺{item.price?.toLocaleString('tr-TR')}
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ara</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Input
          testID="search-input"
          placeholder="Model, marka veya anahtar kelime..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          leftIconName="search"
          onFocus={() => {
            setShowRecentSearches(true);
            setAutocompleteOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              setShowRecentSearches(false);
              setAutocompleteOpen(false);
            }, 200);
          }}
        />

        {/* Recent Searches Dropdown — sadece sorgu boşken */}
        {showRecentSearches && recentSearchQueries.length > 0 && !searchQuery && (
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
                <Ionicons name="time-outline" size={18} color={colors.text.muted} />
                <Text style={styles.recentSearchText}>{query}</Text>
                <TouchableOpacity
                  onPress={() => removeSearch(query)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={18} color={colors.text.subtle} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Autocomplete Rich — kullanıcı 2+ harf yazdıysa */}
        {autocompleteOpen && autocompleteQuery.length >= 2 && autocomplete && (
          <View style={styles.recentSearchesDropdown}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {/* Suggestions */}
              {autocomplete.suggestions && autocomplete.suggestions.length > 0 ? (
                <View style={styles.acSection}>
                  <Text style={styles.acSectionTitle}>Öneriler</Text>
                  {autocomplete.suggestions.slice(0, 5).map((s, i) => (
                    <TouchableOpacity
                      key={`s-${i}`}
                      style={styles.acItem}
                      onPress={() => {
                        setSearchQuery(s);
                        setDebouncedQuery(s);
                        setAutocompleteOpen(false);
                      }}
                    >
                      <Ionicons name="search" size={16} color={colors.text.subtle} />
                      <Text style={styles.acItemText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Products */}
              {autocomplete.products && autocomplete.products.length > 0 ? (
                <View style={styles.acSection}>
                  <Text style={styles.acSectionTitle}>Ürünler</Text>
                  {autocomplete.products.slice(0, 5).map((p) => (
                    <TouchableOpacity
                      key={`p-${p.id}`}
                      style={styles.acItem}
                      onPress={() => {
                        setAutocompleteOpen(false);
                        router.push({ pathname: '/product/[id]', params: { id: p.id } } as any);
                      }}
                    >
                      <Ionicons name="cube-outline" size={16} color={colors.primary[600]!} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.acItemText} numberOfLines={1}>{p.title}</Text>
                        <Text style={styles.acItemMeta}>
                          {p.brandName ? `${p.brandName} · ` : ''}₺{p.price?.toLocaleString('tr-TR')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Brands */}
              {autocomplete.brands && autocomplete.brands.length > 0 ? (
                <View style={styles.acSection}>
                  <Text style={styles.acSectionTitle}>Markalar</Text>
                  {autocomplete.brands.slice(0, 5).map((b) => (
                    <TouchableOpacity
                      key={`b-${b.id}`}
                      style={styles.acItem}
                      onPress={() => {
                        setAutocompleteOpen(false);
                        router.push({ pathname: '/brand/[slug]', params: { slug: b.slug } } as any);
                      }}
                    >
                      <Ionicons name="bookmark-outline" size={16} color={colors.text.muted} />
                      <Text style={styles.acItemText}>{b.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Categories */}
              {autocomplete.categories && autocomplete.categories.length > 0 ? (
                <View style={styles.acSection}>
                  <Text style={styles.acSectionTitle}>Kategoriler</Text>
                  {autocomplete.categories.slice(0, 5).map((c) => (
                    <TouchableOpacity
                      key={`c-${c.id}`}
                      style={styles.acItem}
                      onPress={() => {
                        setAutocompleteOpen(false);
                        router.push({ pathname: '/category/[slug]', params: { slug: c.slug } } as any);
                      }}
                    >
                      <Ionicons name="grid-outline" size={16} color={colors.text.muted} />
                      <Text style={styles.acItemText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {/* Car models */}
              {autocomplete.carModels && autocomplete.carModels.length > 0 ? (
                <View style={styles.acSection}>
                  <Text style={styles.acSectionTitle}>Modeller</Text>
                  {autocomplete.carModels.slice(0, 5).map((m) => (
                    <TouchableOpacity
                      key={`m-${m.id}`}
                      style={styles.acItem}
                      onPress={() => {
                        setAutocompleteOpen(false);
                        router.push({ pathname: '/models/[slug]', params: { slug: m.slug } } as any);
                      }}
                    >
                      <Ionicons name="car-outline" size={16} color={colors.text.muted} />
                      <Text style={styles.acItemText}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Filter & Sort Row */}
      <View style={styles.filterRow}>
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="filter-outline" size={20} color={colors.text.heading} />
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
          <Ionicons name="swap-vertical-outline" size={20} color={colors.text.heading} />
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
          label="Takaslı"
          variant={tradeOnly ? 'primary' : 'neutral'}
          selected={tradeOnly}
          onPress={() => setTradeOnly(!tradeOnly)}
          style={styles.quickChip}
        />
        {selectedBrands.map((brandId) => {
          const brand = BRANDS.find((b) => b.id === brandId);
          return (
            <Chip
              key={brandId}
              label={`${brand?.name || brandId} ✕`}
              variant="primary"
              onPress={() => toggleBrand(brandId)}
              style={styles.activeChip}
            />
          );
        })}
        {selectedScales.map((scaleId) => (
          <Chip
            key={scaleId}
            label={`${scaleId} ✕`}
            variant="primary"
            onPress={() => toggleScale(scaleId)}
            style={styles.activeChip}
          />
        ))}
        {(priceRange[0] > 0 || priceRange[1] < 50000) && (
          <Chip
            label={`₺${priceRange[0].toLocaleString('tr-TR')} - ₺${priceRange[1].toLocaleString('tr-TR')} ✕`}
            variant="primary"
            onPress={() => setPriceRange([0, 50000])}
            style={styles.activeChip}
          />
        )}
        {activeFiltersCount > 0 && (
          <Chip label="Temizle ✕" variant="neutral" onPress={clearAllFilters} />
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
          <Spinner size="lg" color={colors.primary[600]!} />
          <Text variant="body" tone="muted" style={styles.loadingText}>
            Sonuçlar yükleniyor...
          </Text>
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
              <Ionicons name="search-outline" size={64} color={colors.text.subtle} />
              <Text variant="h3" align="center" style={styles.emptyTitle}>
                Sonuç Bulunamadı
              </Text>
              <Text variant="body" tone="muted" align="center" style={styles.emptySubtitle}>
                Farklı anahtar kelimeler veya filtreler deneyin
              </Text>
              <Button
                variant="outline"
                title="Filtreleri Temizle"
                onPress={clearAllFilters}
                style={{ marginTop: spacing[4] }}
              />
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
            <Text variant="h2">Filtreler</Text>
            <IconButton
              icon="close"
              accessibilityLabel="Kapat"
              size="md"
              onPress={() => setFilterModalVisible(false)}
            />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Price Range */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Fiyat Aralığı</Text>
              
              {/* Quick Price Presets */}
              <View style={styles.pricePresets}>
                {[
                  { label: 'Tümü', range: [0, 50000] as [number, number] },
                  { label: '₺0-500', range: [0, 500] as [number, number] },
                  { label: '₺500-1K', range: [500, 1000] as [number, number] },
                  { label: '₺1K-5K', range: [1000, 5000] as [number, number] },
                  { label: '₺5K+', range: [5000, 50000] as [number, number] },
                ].map((preset) => {
                  const sel = priceRange[0] === preset.range[0] && priceRange[1] === preset.range[1];
                  return (
                    <Chip
                      key={preset.label}
                      label={preset.label}
                      selected={sel}
                      onPress={() => setPriceRange(preset.range)}
                      style={styles.pricePresetChip}
                    />
                  );
                })}
              </View>
              
              {/* Custom Range Inputs */}
              <View style={styles.priceInputs}>
                <View style={styles.priceInputContainer}>
                  <Input
                    label="Min ₺"
                    value={priceRange[0].toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 0;
                      setPriceRange([value, priceRange[1]]);
                    }}
                    keyboardType="numeric"
                  />
                </View>
                <Text variant="body" tone="muted" style={styles.priceInputDivider}>
                  -
                </Text>
                <View style={styles.priceInputContainer}>
                  <Input
                    label="Max ₺"
                    value={priceRange[1].toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 50000;
                      setPriceRange([priceRange[0], value]);
                    }}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Brands */}
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Markalar</Text>
              <View style={styles.chipGrid}>
                {BRANDS.map((brand) => (
                  <Chip
                    key={brand.id}
                    label={brand.name}
                    selected={selectedBrands.includes(brand.id)}
                    onPress={() => toggleBrand(brand.id)}
                    style={styles.filterChip}
                  />
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Scales */}
            <View style={styles.filterSection}>
              <Text variant="label" style={styles.filterSectionTitle}>
                Ölçek
              </Text>
              <View style={styles.chipGrid}>
                {SCALES.map((scale) => (
                  <Chip
                    key={scale.id}
                    label={scale.id}
                    selected={selectedScales.includes(scale.id)}
                    onPress={() => toggleScale(scale.id)}
                    style={styles.filterChip}
                  />
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Condition */}
            <View style={styles.filterSection}>
              <Text variant="label" style={styles.filterSectionTitle}>
                Durum
              </Text>
              <View style={styles.chipGrid}>
                {CONDITIONS.map((condition) => (
                  <Chip
                    key={condition.id}
                    label={condition.name}
                    selected={selectedConditions.includes(condition.id)}
                    onPress={() => toggleCondition(condition.id)}
                    style={styles.filterChip}
                  />
                ))}
              </View>
            </View>

            <Divider style={styles.divider} />

            {/* Trade Filter */}
            <View style={styles.checkboxRow}>
              <Checkbox
                checked={tradeOnly}
                onChange={() => setTradeOnly(!tradeOnly)}
                label="Sadece Takas Yapılabilir"
              />
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button
              variant="outline"
              title="Temizle"
              onPress={clearAllFilters}
              style={styles.modalButton}
            />
            <Button
              variant="primary"
              title={`${products?.length || 0} Sonuç Göster`}
              onPress={() => setFilterModalVisible(false)}
              style={{ ...styles.modalButton, flex: 2 }}
            />
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
            <Text variant="h2" style={styles.sortModalTitle}>
              Sıralama
            </Text>
            {SORT_OPTIONS.map((option) => {
              const isActive = sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => {
                    setSortBy(option.value);
                    setSortModalVisible(false);
                  }}
                >
                  <Ionicons
                    name={option.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={20}
                    color={isActive ? colors.primary[600]! : colors.text.muted}
                  />
                  <Text
                    variant="body"
                    tone={isActive ? 'primary' : 'heading'}
                    weight={isActive ? 'semibold' : 'regular'}
                    style={styles.sortOptionText}
                  >
                    {option.label}
                  </Text>
                  <Radio
                    checked={isActive}
                    onChange={() => {
                      setSortBy(option.value);
                      setSortModalVisible(false);
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.surface.DEFAULT,
    position: 'relative',
    zIndex: 10,
  },
  recentSearchesDropdown: {
    position: 'absolute',
    top: '100%',
    left: 16,
    right: 16,
    backgroundColor: colors.surface.DEFAULT,
    borderRadius: 12,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 100,
    marginTop: -8,
    borderWidth: 1,
    borderColor: colors.border.DEFAULT,
  },
  acSection: {
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  acSectionTitle: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  acItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  acItemText: {
    fontSize: 14,
    color: colors.text.heading,
    flex: 1,
  },
  acItemMeta: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  recentSearchesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  recentSearchesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
  },
  clearRecentText: {
    fontSize: 13,
    color: colors.primary[600]!,
    fontWeight: '500',
  },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  recentSearchText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: colors.text.heading,
  },
  searchBar: {
    backgroundColor: colors.surface.alt,
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
    backgroundColor: colors.surface.DEFAULT,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginHorizontal: 8,
    backgroundColor: colors.surface.alt,
    borderRadius: 8,
  },
  filterButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.heading,
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: colors.primary[600]!,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.white,
  },
  quickFilters: {
    backgroundColor: colors.surface.DEFAULT,
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
    backgroundColor: colors.primary[600]!,
  },
  quickChipTextActive: {
    color: colors.white,
  },
  activeChip: {
    marginRight: 8,
    backgroundColor: colors.primary[50]!,
  },
  resultsCount: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface.alt,
  },
  resultsCountText: {
    fontSize: 13,
    color: colors.text.muted,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  listRow: {
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    width: CARD_WIDTH,
    marginBottom: 16,
  },
  productCard: {
    overflow: 'hidden',
    backgroundColor: colors.surface.DEFAULT,
    elevation: 2,
    shadowColor: colors.black,
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
    backgroundColor: colors.warning[500]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tradeBadgeText: {
    marginLeft: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.white,
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
    color: colors.white,
  },
  productContent: {
    paddingVertical: 12,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.heading,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary[600]!,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.text.muted,
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
    color: colors.text.heading,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.surface.DEFAULT,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.heading,
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
    color: colors.text.heading,
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
    color: colors.text.muted,
    marginBottom: 4,
  },
  priceInput: {
    backgroundColor: colors.surface.DEFAULT,
    height: 44,
  },
  priceInputDivider: {
    fontSize: 18,
    color: colors.text.muted,
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
    backgroundColor: colors.primary[600]!,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkboxLabel: {
    fontSize: 16,
    color: colors.text.heading,
    marginLeft: 8,
  },
  divider: {
    marginVertical: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border.DEFAULT,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
  },
  // Sort Modal
  sortModalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay.black50,
    justifyContent: 'flex-end',
  },
  sortModalContent: {
    backgroundColor: colors.surface.DEFAULT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  sortModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border.DEFAULT,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.heading,
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
    color: colors.text.heading,
    marginLeft: 12,
  },
  sortOptionTextActive: {
    color: colors.primary[600]!,
    fontWeight: '600',
  },
});
