import { useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { productsApi, categoriesApi } from '@/services/api';
import { SORT_OPTIONS } from '../_lib/constants';

/**
 * Category controller — owns the category-detail query, the filtered products
 * query (search + sort + scale), refresh and the sort-menu/label. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useCategory() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [selectedScale, setSelectedScale] = useState('');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { data: category } = useQuery({
    queryKey: ['category', slug],
    queryFn: async () => {
      try {
        const response = await categoriesApi.getBySlug(slug);
        return response.data.category || response.data;
      } catch (error) {
        console.log('Category fetch error:', error);
        return null;
      }
    },
    enabled: !!slug,
  });

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['category-products', category?.id, searchQuery, sortBy, selectedScale],
    queryFn: async () => {
      try {
        const params: any = { categoryId: category?.id, limit: 50, sortBy };
        if (searchQuery) params.search = searchQuery;
        if (selectedScale) params.scale = selectedScale;

        const response = await productsApi.getAll(params);
        return response.data.data || response.data.products || [];
      } catch (error) {
        console.log('Products fetch error:', error);
        return [];
      }
    },
    enabled: !!category?.id,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getSortLabel = () => SORT_OPTIONS.find((o) => o.id === sortBy)?.name || 'Sırala';

  return {
    category,
    products,
    isLoading,
    refreshing,
    onRefresh,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    selectedScale,
    setSelectedScale,
    sortMenuVisible,
    setSortMenuVisible,
    getSortLabel,
  };
}

export type CategoryController = ReturnType<typeof useCategory>;
