import { useState, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { useProductFilterOptions } from '@/hooks/useProductFilterOptions';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  buildListParams,
  countActiveFilters,
  extractListings,
  extractMeta,
  type ProductFilters,
} from '@/utils/productFilters';
import { buildActiveChips } from '../_lib/chips';

const PAGE_SIZE = 24;

/**
 * Listings controller — owns the filters + search state, the manufacturer-slug
 * resolution, the bounded infinite query, derived listings/total/active chips,
 * and the modal visibility flags. Lifted verbatim from the monolithic screen (§12).
 */
export function useListings() {
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

  const applySearch = () => setFilters((prev) => ({ ...prev, search: searchQuery.trim() }));

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['listings', filters],
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
    // Bound resident pages (#76) — image-heavy list, trim trailing pages.
    maxPages: 5,
    getPreviousPageParam: (first) => (first.meta.page > 1 ? first.meta.page - 1 : undefined),
  });

  const listings: any[] = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.meta.total ?? 0;
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const clearFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSearchQuery('');
  };

  const getSortLabel = () =>
    SORT_OPTIONS.find((o) => o.value === filters.sortBy)?.label || 'Sırala';

  const activeChips = buildActiveChips(filters, setFilters);

  return {
    filters,
    setFilters,
    searchQuery,
    setSearchQuery,
    applySearch,
    filterModalVisible,
    setFilterModalVisible,
    sortMenuVisible,
    setSortMenuVisible,
    options,
    listings,
    total,
    activeFilterCount,
    activeChips,
    clearFilters,
    getSortLabel,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  };
}

export type ListingsController = ReturnType<typeof useListings>;
