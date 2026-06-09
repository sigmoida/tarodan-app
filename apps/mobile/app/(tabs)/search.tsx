import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Pressable,
  RefreshControl,
  Keyboard,
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Button,
  Card,
  Chip,
  Input,
  Radio,
  Spinner,
  Text,
  theme,
} from '@tarodan/ui-native';
import { productsApi, searchApi } from '../../src/services/api';
import { useRecentSearchesStore } from '../../src/stores/recentSearchesStore';
import { useCartStore } from '../../src/stores/cartStore';
import { getImageUrl as getImageUrlFromUtils } from '../../src/utils/imageUrl';
import { isProductOutOfStock } from '../../src/utils/productPrice';
import { OutOfStockOverlay } from '../../src/components/product';
import { asLabel } from '../../src/utils/format';
import ProductFilterSheet from '../../src/components/ProductFilterSheet';
import { useProductFilterOptions } from '../../src/hooks/useProductFilterOptions';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  CONDITION_OPTIONS,
  buildListParams,
  countActiveFilters,
  extractListings,
  extractMeta,
  type ProductFilters,
} from '../../src/utils/productFilters';

const { colors, spacing, radius } = theme;

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const PAGE_SIZE = 24;

const conditionLabel = (v: string) =>
  CONDITION_OPTIONS.find((c) => c.value === v)?.label || v;

// Üst çubuklar (arama + filtre) için tahmini başlangıç yüksekliği; gerçek değer onLayout ile ölçülür.
const COLLAPSIBLE_ESTIMATE = 180;

export default function SearchScreen() {
  const params = useLocalSearchParams();

  // Filtre state'i (web listings/page.tsx ile aynı shape)
  const [filters, setFilters] = useState<ProductFilters>(() => ({
    ...EMPTY_FILTERS,
    search: (params.q as string) || '',
    category: (params.category as string) || '',
    categoryId: (params.categoryId as string) || '',
    brand: (params.brand as string) || '',
    brandId: (params.brandId as string) || '',
    scale: (params.scale as string) || '',
    manufacturer: (params.manufacturer as string) || '',
    manufacturerId: (params.manufacturerId as string) || '',
  }));

  // Arama kutusu — yazarken debounce ile filters.search'e yansır
  const [searchQuery, setSearchQuery] = useState(filters.search);

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Anasayfadan gelen filtreleri uygula. Ara kalıcı bir tab olduğu için ekran ilk
  // mount'tan sonra yeniden kurulmaz; bu yüzden parametreleri reaktif izleyip her taze
  // navigasyonda (benzersiz `t` token'ı) filtreleri sıfırdan kurarız. Token'sız giriş
  // (kullanıcı sadece Ara tab'ına basınca) mevcut filtreleri korur.
  const navToken = params.t as string | undefined;
  const lastTokenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!navToken || navToken === lastTokenRef.current) return;
    lastTokenRef.current = navToken;

    if (params.reset) {
      setFilters({ ...EMPTY_FILTERS });
      setSearchQuery('');
      return;
    }
    const next: ProductFilters = {
      ...EMPTY_FILTERS,
      search: (params.q as string) || '',
      category: (params.category as string) || '',
      categoryId: (params.categoryId as string) || '',
      brand: (params.brand as string) || '',
      brandId: (params.brandId as string) || '',
      manufacturer: (params.manufacturer as string) || '',
      manufacturerId: (params.manufacturerId as string) || '',
      scale: (params.scale as string) || '',
    };
    setFilters(next);
    setSearchQuery(next.search);
    if (params.openFilter) setFilterModalVisible(true);
    // navToken değişiminde URL parametrelerini bir kez uygula (kasıtlı sınırlı bağımlılık)
  }, [navToken]);

  // Seçili üreticinin slug'ını çöz ki üreticiye-özel filtreler (HW vb.) yüklensin.
  const baseOptions = useProductFilterOptions();
  const manufacturerSlug = useMemo(() => {
    const list = baseOptions.manufacturers;
    if (filters.manufacturerId) return list.find((m) => m.id === filters.manufacturerId)?.slug;
    if (filters.manufacturer)
      return list.find((m) => m.name.toLowerCase() === filters.manufacturer.toLowerCase())?.slug;
    return undefined;
  }, [filters.manufacturerId, filters.manufacturer, baseOptions.manufacturers]);
  const options = useProductFilterOptions(manufacturerSlug);

  const { searches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();
  const recentSearchQueries = searches.map((s) => s.query);

  // Sepetteki ürünler — kart üstünde "Sepette" göstergesi için (sepet değişince güncellenir).
  const cartItems = useCartStore((s) => s.items);
  const cartProductIds = useMemo(() => new Set(cartItems.map((i) => i.productId)), [cartItems]);

  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Sonuç listesi aşağı kaydırılınca üst çubukları (arama + filtre) gizle, yukarı kaydırınca geri getir.
  const [topBarsHidden, setTopBarsHidden] = useState(false);
  // Liste yeterince aşağı inince "en üste dön" butonunu göster.
  const [showScrollTop, setShowScrollTop] = useState(false);
  const lastScrollY = useRef(0);
  const listRef = useRef<FlatList>(null);

  // Üst çubukları absolute bir katmanda tutup translateY ile kaydırıyoruz (liste reflow olmaz → takılmaz).
  const [headerHeight, setHeaderHeight] = useState(COLLAPSIBLE_ESTIMATE);
  const barsTranslateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(barsTranslateY, {
      toValue: topBarsHidden ? -headerHeight : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [topBarsHidden, headerHeight, barsTranslateY]);
  const onBarsLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - headerHeight) > 0.5) setHeaderHeight(h);
  };

  // Arama kutusu → filters.search (debounce 400ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => (prev.search === searchQuery ? prev : { ...prev, search: searchQuery.trim() }));
      const q = searchQuery.trim();
      setAutocompleteQuery(q.length >= 2 ? q : '');
      if (q.length >= 2) addSearch(q);
    }, 400);
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

  // --- Ürün listesi: web /products endpoint'i + sayfalama (sonsuz kaydırma) ---
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['products-search', filters],
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

  const products: any[] = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.meta.total ?? 0;

  const activeFiltersCount = useMemo(() => countActiveFilters(filters), [filters]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  const handleRecentSearchSelect = (query: string) => {
    setSearchQuery(query);
    setShowRecentSearches(false);
    setAutocompleteOpen(false);
  };

  const clearAllFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSearchQuery('');
  };

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  // Aktif filtre çipleri (web parity: kaldırılabilir)
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

  const renderProduct = ({ item }: { item: any }) => {
    const imageUrl = getImageUrlFromUtils(item.images);
    const ratingAvg = item.rating?.average ? Number(item.rating.average) : 0;
    const ratingCount = item.rating?.count ?? item.reviewCount ?? 0;
    const price = item.price ?? item.salePrice ?? null;
    const oldPrice = item.originalPrice ?? item.oldPrice ?? null;
    const hasDiscount = oldPrice != null && price != null && Number(oldPrice) > Number(price);
    const discountPercent =
      item.discountPercent ??
      (hasDiscount ? Math.round((1 - Number(price) / Number(oldPrice)) * 100) : 0);
    return (
      <Pressable
        testID="search-result-card"
        onPress={() => handleProductPress(item.id)}
        style={({ pressed }) => [styles.productCardWrapper, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Card style={styles.productCard} padding={0}>
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: imageUrl }}
              style={[styles.productImage, isProductOutOfStock(item) && { opacity: 0.45 }]}
              resizeMode="cover"
            />
            {isProductOutOfStock(item) && <OutOfStockOverlay />}
            {(item.tradeAvailable || item.isTradeEnabled) && (
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
            {cartProductIds.has(item.id) && (
              <View style={styles.inCartPill}>
                <Ionicons name="checkmark-circle" size={12} color={colors.white} />
                <Text variant="caption" tone="inverted" weight="bold" style={{ marginLeft: 4 }}>
                  Sepette
                </Text>
              </View>
            )}
          </View>
          <View style={styles.productContent}>
            <Text variant="bodySm" weight="semibold" numberOfLines={2}>
              {item.title}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {asLabel(item.brand, 'Marka')} • {asLabel(item.scale, '1:64')}
            </Text>
            {ratingAvg > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
                <Ionicons name="star" size={12} color={colors.warning[500]!} />
                <Text variant="caption" tone="muted">
                  {ratingAvg.toFixed(1)}
                  {ratingCount ? ` (${ratingCount})` : ''}
                </Text>
              </View>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 4,
              }}
            >
              <Text variant="h3" tone="primary">
                ₺{Number(price ?? 0).toLocaleString('tr-TR')}
              </Text>
              {hasDiscount ? (
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ textDecorationLine: 'line-through' }}
                >
                  ₺{Number(oldPrice).toLocaleString('tr-TR')}
                </Text>
              ) : null}
              {discountPercent > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.danger[600]!,
                    borderRadius: 4,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                  }}
                >
                  <Text variant="caption" tone="inverted" weight="bold">
                    %{discountPercent}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  // Öneri/geçmiş paneli görünür mü? (X kapat tuşu ve input köşe stilinde kullanılır)
  const recentPanelOpen =
    showRecentSearches && recentSearchQueries.length > 0 && !searchQuery;
  const autocompletePanelOpen =
    autocompleteOpen && autocompleteQuery.length >= 2 && !!autocomplete;
  const suggestionsOpen = recentPanelOpen || autocompletePanelOpen;

  const closeSuggestions = () => {
    Keyboard.dismiss();
    setShowRecentSearches(false);
    setAutocompleteOpen(false);
  };

  // Öneriden bir facet (marka/üretici/kategori) seçilince: paneli kapat ve arama metnini temizle
  // (yoksa arama + facet birlikte 2 filtre gibi sayılır).
  const applyFacet = (partial: Partial<ProductFilters>) => {
    setSearchQuery('');
    closeSuggestions();
    setFilters((prev) => ({ ...prev, search: '', ...partial }));
  };

  const handleResultsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const prev = lastScrollY.current;
    // Sonuçları kaydırınca öneri/geçmiş panelini ve klavyeyi tamamen kapat.
    if (showRecentSearches || autocompleteOpen) closeSuggestions();
    if (y <= 4) {
      if (topBarsHidden) setTopBarsHidden(false);
    } else if (y - prev > 6 && !topBarsHidden && y > headerHeight) {
      setTopBarsHidden(true);
    } else if (prev - y > 6 && topBarsHidden) {
      setTopBarsHidden(false);
    }
    if (y > 600 && !showScrollTop) setShowScrollTop(true);
    else if (y <= 600 && showScrollTop) setShowScrollTop(false);
    lastScrollY.current = y;
  };

  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ara</Text>
      </View>

      {/* Üst çubuklar absolute katmanda; kaydırınca translateY ile yukarı kayar (liste reflow olmaz) */}
      <View style={styles.resultsArea}>
        <Animated.View
          style={[styles.collapsibleBars, { transform: [{ translateY: barsTranslateY }] }]}
          onLayout={onBarsLayout}
        >
          {/* Search Bar */}
          <View style={styles.searchSection}>
            <View style={styles.searchAnchor}>
              <Input
                testID="search-input"
                placeholder="Model, marka veya anahtar kelime..."
                value={searchQuery}
                onChangeText={handleSearchChange}
                leftIconName="search"
                containerStyle={styles.searchInputContainer}
                fieldStyle={[
                  styles.searchInputField,
                  suggestionsOpen && styles.searchInputFieldOpen,
                ]}
                rightIcon={
                  suggestionsOpen ? (
                    <Pressable onPress={closeSuggestions} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                    </Pressable>
                  ) : undefined
                }
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

              {/* Recent Searches */}
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

              {/* Autocomplete Rich */}
              {autocompleteOpen && autocompleteQuery.length >= 2 && autocomplete && (
                <View style={styles.recentSearchesDropdown}>
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
                    {autocomplete.suggestions && autocomplete.suggestions.length > 0 ? (
                      <View style={styles.acSection}>
                        <Text style={styles.acSectionTitle}>Öneriler</Text>
                        {autocomplete.suggestions.slice(0, 5).map((s, i) => (
                          <TouchableOpacity
                            key={`s-${i}`}
                            style={styles.acItem}
                            onPress={() => {
                              setSearchQuery(s);
                              setAutocompleteOpen(false);
                            }}
                          >
                            <Ionicons name="search" size={16} color={colors.text.subtle} />
                            <Text style={styles.acItemText}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

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

                    {autocomplete.brands && autocomplete.brands.length > 0 ? (
                      <View style={styles.acSection}>
                        <Text style={styles.acSectionTitle}>Markalar</Text>
                        {autocomplete.brands.slice(0, 5).map((b) => (
                          <TouchableOpacity
                            key={`b-${b.id}`}
                            style={styles.acItem}
                            onPress={() =>
                              applyFacet({ brandId: b.id, brand: b.name, carModel: '', carModelId: '' })
                            }
                          >
                            <Ionicons name="bookmark-outline" size={16} color={colors.text.muted} />
                            <Text style={styles.acItemText}>{b.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {autocomplete.manufacturers && autocomplete.manufacturers.length > 0 ? (
                      <View style={styles.acSection}>
                        <Text style={styles.acSectionTitle}>Üreticiler</Text>
                        {autocomplete.manufacturers.slice(0, 5).map((m) => (
                          <TouchableOpacity
                            key={`mf-${m.id}`}
                            style={styles.acItem}
                            onPress={() =>
                              applyFacet({ manufacturerId: m.id, manufacturer: m.name })
                            }
                          >
                            <Ionicons name="construct-outline" size={16} color={colors.text.muted} />
                            <Text style={styles.acItemText}>{m.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {autocomplete.categories && autocomplete.categories.length > 0 ? (
                      <View style={styles.acSection}>
                        <Text style={styles.acSectionTitle}>Kategoriler</Text>
                        {autocomplete.categories.slice(0, 5).map((c) => (
                          <TouchableOpacity
                            key={`c-${c.id}`}
                            style={styles.acItem}
                            onPress={() =>
                              applyFacet({ categoryId: c.id, category: c.name })
                            }
                          >
                            <Ionicons name="grid-outline" size={16} color={colors.text.muted} />
                            <Text style={styles.acItemText}>{c.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          {/* Filter & Sort Row */}
          <View style={styles.filterRow}>
            <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)}>
              <Ionicons name="filter-outline" size={20} color={colors.text.heading} />
              <Text style={styles.filterButtonText}>Filtrele</Text>
              {activeFiltersCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.filterButton} onPress={() => setSortModalVisible(true)}>
              <Ionicons name="swap-vertical-outline" size={20} color={colors.text.heading} />
              <Text style={styles.filterButtonText}>
                {SORT_OPTIONS.find((s) => s.value === filters.sortBy)?.label || 'Sırala'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Active Filter Chips */}
          {activeChips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickFilters}
              contentContainerStyle={styles.quickFiltersContent}
            >
              {activeChips.map((c) => (
                <Chip
                  key={c.key}
                  label={`${c.label} ✕`}
                  variant="primary"
                  onPress={c.onRemove}
                  style={styles.activeChip}
                />
              ))}
              <Chip label="Temizle ✕" variant="neutral" onPress={clearAllFilters} />
            </ScrollView>
          )}

          {/* Results Count */}
          <View style={styles.resultsCount}>
            <Text style={styles.resultsCountText}>
              {isLoading ? 'Aranıyor...' : `${total} sonuç bulundu`}
            </Text>
          </View>
        </Animated.View>

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
            ref={listRef}
            data={products}
            numColumns={2}
            contentContainerStyle={[styles.listContent, { paddingTop: headerHeight }]}
            columnWrapperStyle={styles.listRow}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            renderItem={renderProduct}
            showsVerticalScrollIndicator={false}
            onScroll={handleResultsScroll}
            scrollEventThrottle={16}
            keyboardDismissMode="on-drag"
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[colors.primary[600]!]}
                tintColor={colors.primary[600]!}
              />
            }
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={{ paddingVertical: spacing[4] }}>
                  <Spinner size="md" color={colors.primary[600]!} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="search-outline" size={64} color={colors.text.subtle} />
                <Text variant="h3" align="center" style={styles.emptyTitle}>
                  {isError ? 'Bir hata oluştu' : 'Sonuç Bulunamadı'}
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
      </View>

      {/* En üste dön butonu — liste yeterince aşağı inince görünür */}
      {showScrollTop && (
        <TouchableOpacity
          style={styles.scrollTopFab}
          onPress={scrollToTop}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="En üste dön"
        >
          <Ionicons name="chevron-up" size={26} color={colors.white} />
        </TouchableOpacity>
      )}

      {/* Filter Modal (web SidebarFilters paritesi) */}
      <ProductFilterSheet
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onChange={setFilters}
        onClear={clearAllFilters}
        options={options}
        resultCount={total}
      />

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
              const isActive = filters.sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => {
                    setFilters({ ...filters, sortBy: option.value });
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
                  <Radio checked={isActive} onChange={() => {
                    setFilters({ ...filters, sortBy: option.value });
                    setSortModalVisible(false);
                  }} />
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
  container: { flex: 1, backgroundColor: colors.surface.alt },
  header: {
    backgroundColor: colors.primary[600]!,
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.white },
  // Sonuç alanı: absolute üst çubukları barındırır; yukarı kayan çubukları kırpar.
  resultsArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  // Üst çubuklar (arama + filtre + çipler + sayım) — absolute katman, liste üstünde durur.
  collapsibleBars: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: colors.surface.DEFAULT,
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.surface.DEFAULT,
    position: 'relative',
    zIndex: 10,
  },
  searchAnchor: {
    position: 'relative',
    zIndex: 20,
  },
  searchInputContainer: {
    marginBottom: 0,
  },
  searchInputField: {
    borderColor: colors.primary[600]!,
    borderWidth: 1.5,
  },
  searchInputFieldOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  recentSearchesDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: -1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderTopWidth: 0,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: colors.primary[600]!,
    elevation: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    zIndex: 100,
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
  acItemText: { fontSize: 14, color: colors.text.heading, flex: 1 },
  acItemMeta: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  recentSearchesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  recentSearchesTitle: { fontSize: 14, fontWeight: '600', color: colors.text.heading },
  clearRecentText: { fontSize: 13, color: colors.primary[600]!, fontWeight: '500' },
  recentSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.DEFAULT,
  },
  recentSearchText: { flex: 1, marginLeft: 12, fontSize: 14, color: colors.text.heading },
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
  filterButtonText: { marginLeft: 8, fontSize: 14, fontWeight: '500', color: colors.text.heading },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: colors.primary[600]!,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: { fontSize: 12, fontWeight: 'bold', color: colors.white },
  quickFilters: { backgroundColor: colors.surface.DEFAULT, maxHeight: 56 },
  quickFiltersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
  },
  activeChip: { marginRight: 8, backgroundColor: colors.primary[50]! },
  resultsCount: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface.alt },
  resultsCountText: { fontSize: 13, color: colors.text.muted },
  listContent: { padding: 16, paddingTop: 8 },
  listRow: { justifyContent: 'space-between' },
  scrollTopFab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary[600]!,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 50,
  },
  productCardWrapper: { width: CARD_WIDTH, marginBottom: 16 },
  productCard: {
    overflow: 'hidden',
    backgroundColor: colors.surface.DEFAULT,
    elevation: 2,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageWrap: { position: 'relative' },
  productImage: { height: CARD_WIDTH },
  inCartPill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[600]!,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
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
  conditionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  productContent: { paddingVertical: 12 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: colors.text.muted },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text.heading, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: colors.text.muted, textAlign: 'center', marginTop: 8 },
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
  sortModalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text.heading, marginBottom: 16 },
  sortOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  sortOptionText: { flex: 1, fontSize: 16, color: colors.text.heading, marginLeft: 12 },
});
