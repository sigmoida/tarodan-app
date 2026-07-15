import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  Keyboard,
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';

import { productsApi, searchApi } from '@/lib/api';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';
import { useCartStore } from '@/stores/cartStore';
import { useProductFilterOptions } from '@/hooks/useProductFilterOptions';
import {
  EMPTY_FILTERS,
  buildListParams,
  countActiveFilters,
  extractListings,
  extractMeta,
  type ProductFilters,
} from '@/utils/productFilters';
import { PAGE_SIZE, COLLAPSIBLE_ESTIMATE, conditionLabel } from '../_lib/searchConstants';

/**
 * Search screen controller — owns filter state, the debounced search box, the
 * nav-token param sync, autocomplete + seller-autocomplete queries, the infinite
 * product query, collapsible-bars animation, scroll behaviors, and modal state.
 * Lifted verbatim from the monolithic SearchScreen.
 */
export function useSearch() {
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

  // İsimle satıcı arama — autocomplete'te "Satıcılar" bölümü
  const sellerAutoRes = useQuery({
    queryKey: ['autocomplete-sellers', autocompleteQuery],
    queryFn: async () => {
      if (!autocompleteQuery) return [];
      try {
        const response = await searchApi.users(autocompleteQuery, 6);
        return response.data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!autocompleteQuery,
  });
  const sellerResults = sellerAutoRes.data ?? [];

  // --- Ürün listesi: web /products endpoint'i + sayfalama (sonsuz kaydırma) ---
  const {
    data,
    isLoading,
    isError,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['products-search', filters],
    placeholderData: keepPreviousData,
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
    // Bound resident pages (#76): image-heavy feed — react-query trims trailing
    // pages past this window instead of holding every scrolled page for gcTime.
    maxPages: 5,
    getPreviousPageParam: (first) =>
      first.meta.page > 1 ? first.meta.page - 1 : undefined,
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

  return {
    // filters / search box
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    handleSearchChange,
    clearAllFilters,
    activeChips,
    activeFiltersCount,
    // options for the filter sheet
    options,
    // recent searches
    recentSearchQueries,
    clearSearches,
    removeSearch,
    handleRecentSearchSelect,
    // suggestions / autocomplete
    autocompleteOpen,
    setAutocompleteOpen,
    autocompleteQuery,
    autocomplete,
    sellerResults,
    showRecentSearches,
    setShowRecentSearches,
    suggestionsOpen,
    closeSuggestions,
    applyFacet,
    // cart
    cartProductIds,
    // list query
    products,
    total,
    isLoading,
    isError,
    isFetching,
    isRefetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    handleProductPress,
    // collapsible bars + scroll
    listRef,
    headerHeight,
    barsTranslateY,
    onBarsLayout,
    handleResultsScroll,
    showScrollTop,
    scrollToTop,
    // modals
    filterModalVisible,
    setFilterModalVisible,
    sortModalVisible,
    setSortModalVisible,
  };
}

export type SearchController = ReturnType<typeof useSearch>;
