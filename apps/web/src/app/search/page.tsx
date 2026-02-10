'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { listingsApi, categoriesApi } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ClockIcon,
  AdjustmentsHorizontalIcon,
  HeartIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { useTranslation } from '@/i18n';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  images: string[];
  condition: string;
  status: string;
  isTradeEnabled: boolean;
  seller: {
    id: string;
    displayName: string;
  };
  category?: {
    id: string;
    name: string;
  };
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const query = searchParams.get('q') || '';
  const { searches: recentSearches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();

  const [searchTerm, setSearchTerm] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    categoryId: searchParams.get('category') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    condition: searchParams.get('condition') || '',
    isTradeEnabled: searchParams.get('trade') === 'true',
    sortBy: searchParams.get('sort') || 'createdAt',
    sortOrder: searchParams.get('order') || 'desc',
  });
  const [page, setPage] = useState(1);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setSearchTerm(query);
  }, [query]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const response = await categoriesApi.findAll();
      return response.data.data || response.data || [];
    },
    meta: { page: 'search-categories' },
  });
  const categories = categoriesQuery.data ?? [];

  const productsQuery = useQuery({
    queryKey: ['search-products', query, filters, page],
    queryFn: async () => {
      const params: any = {
        page,
        limit: 24,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };
      if (query) params.search = query;
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.minPrice) params.minPrice = parseFloat(filters.minPrice);
      if (filters.maxPrice) params.maxPrice = parseFloat(filters.maxPrice);
      if (filters.condition) params.condition = filters.condition;
      if (filters.isTradeEnabled) params.isTradeEnabled = true;
      const response = await listingsApi.getAll(params);
      const data = response.data;
      return {
        products: data.data || data.products || [],
        totalPages: data.meta?.totalPages || 1,
        totalItems: data.meta?.total || 0,
      };
    },
    meta: { page: 'search-products' },
  });
  const products = productsQuery.data?.products ?? [];
  const totalPages = productsQuery.data?.totalPages ?? 1;
  const totalItems = productsQuery.data?.totalItems ?? 0;
  const loading = productsQuery.isLoading;

  // "Did you mean?" suggestions - fetch when we have a query but no results
  const suggestionsQuery = useQuery({
    queryKey: ['search-suggestions', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      try {
        const response = await listingsApi.getAll({ search: '', limit: 10 });
        const allProducts = response.data?.data || response.data?.products || [];
        // Get unique titles that partially match the query
        const titles = allProducts
          .map((p: Product) => p.title)
          .filter((title: string) => title.toLowerCase().includes(query.slice(0, 3).toLowerCase()))
          .slice(0, 3);
        return titles;
      } catch {
        return [];
      }
    },
    enabled: isMounted && !!query && products.length === 0 && !loading,
    meta: { page: 'search-suggestions' },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchTerm.trim();
    if (trimmed) addSearch(trimmed);
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (filters.categoryId) params.set('category', filters.categoryId);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.condition) params.set('condition', filters.condition);
    if (filters.isTradeEnabled) params.set('trade', 'true');
    if (filters.sortBy !== 'createdAt') params.set('sort', filters.sortBy);
    if (filters.sortOrder !== 'desc') params.set('order', filters.sortOrder);

    router.push(`/search?${params.toString()}`);
  };

  const handleRecentSearchClick = (q: string) => {
    setSearchTerm(q);
    const params = new URLSearchParams();
    params.set('q', q);
    router.push(`/search?${params.toString()}`);
  };

  const clearFilters = () => {
    setFilters({
      categoryId: '',
      minPrice: '',
      maxPrice: '',
      condition: '',
      isTradeEnabled: false,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    if (searchTerm) {
      router.push(`/search?q=${encodeURIComponent(searchTerm)}`);
    } else {
      router.push('/search');
    }
  };

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      new: t('product.conditionNew'),
      like_new: t('product.conditionLikeNew'),
      very_good: t('product.conditionVeryGood'),
      good: t('product.conditionGood'),
      fair: t('product.conditionFair'),
    };
    return labels[condition] || condition;
  };

  return (
    <div className="min-h-screen bg-dark-900">
      <main className="container mx-auto px-4 py-8">
        {/* Search Header */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('search.searchPlaceholder')}
                className="w-full bg-dark-800 border border-dark-700 rounded-full pl-12 pr-32 py-4 text-white focus:outline-none focus:border-primary-500 text-lg"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-full transition-colors"
              >
                {t('common.search')}
              </button>
            </div>
          </form>

          {/* Son aranılanlar */}
          {isMounted && recentSearches.length > 0 && (
            <div className="max-w-2xl mx-auto mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-400 flex items-center gap-1.5">
                  <ClockIcon className="h-4 w-4" />
                  {t('search.recentSearches')}
                </span>
                <button
                  type="button"
                  onClick={clearSearches}
                  className="text-xs text-gray-500 hover:text-primary-400 transition-colors"
                >
                  {t('search.clearAll')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((q) => (
                  <div key={q} className="group flex items-center gap-1 bg-dark-800 border border-dark-700 rounded-full pl-4 pr-2 py-2">
                    <button
                      type="button"
                      onClick={() => handleRecentSearchClick(q)}
                      className="text-sm text-gray-300 hover:text-white transition-colors"
                    >
                      {q}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSearch(q); }}
                      className="p-1 rounded-full text-gray-500 hover:text-gray-300 hover:bg-dark-700 transition-colors"
                      aria-label={t('common.close')}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {query && (
              <h1 className="text-2xl font-bold text-white">
                "{query}" {t('search.searchFor')}
              </h1>
            )}
            <p className="text-gray-400 mt-1">
              {totalItems} {t('search.resultsFound')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Sort */}
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-');
                setFilters({ ...filters, sortBy, sortOrder });
              }}
              className="bg-dark-800 border border-dark-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="createdAt-desc">{t('product.sortNewest')}</option>
              <option value="createdAt-asc">{t('product.sortOldest')}</option>
              <option value="price-asc">{t('product.sortPriceLow')}</option>
              <option value="price-desc">{t('product.sortPriceHigh')}</option>
              <option value="title-asc">A-Z</option>
            </select>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${showFilters
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-dark-800 border-dark-700 text-gray-300 hover:border-primary-500'
                }`}
            >
              <FunnelIcon className="h-5 w-5" />
              {t('common.filter')}
            </button>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Filters Sidebar */}
          {showFilters && (
            <div className="w-72 flex-shrink-0">
              <div className="bg-dark-800 rounded-lg p-6 sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">{t('product.filters')}</h3>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    {t('common.clear')}
                  </button>
                </div>

                {/* Category Filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    {t('product.category')}
                  </label>
                  <select
                    value={filters.categoryId}
                    onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="">{t('common.all')}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    {t('product.priceRange')}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      value={filters.minPrice}
                      onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                      placeholder="Min"
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="number"
                      value={filters.maxPrice}
                      onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                      placeholder="Max"
                      className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                {/* Condition Filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    {t('product.condition')}
                  </label>
                  <select
                    value={filters.condition}
                    onChange={(e) => setFilters({ ...filters, condition: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="">{t('common.all')}</option>
                    <option value="new">{t('product.conditionNew')}</option>
                    <option value="like_new">{t('product.conditionLikeNew')}</option>
                    <option value="very_good">{t('product.conditionVeryGood')}</option>
                    <option value="good">{t('product.conditionGood')}</option>
                    <option value="fair">{t('product.conditionFair')}</option>
                  </select>
                </div>

                {/* Trade Enabled */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.isTradeEnabled}
                      onChange={(e) => setFilters({ ...filters, isTradeEnabled: e.target.checked })}
                      className="rounded border-dark-600 text-primary-500 focus:ring-primary-500 bg-dark-700"
                    />
                    <span className="text-gray-300">{t('product.tradeAvailable')}</span>
                  </label>
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleSearch}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg transition-colors"
                >
                  {t('product.applyFilters')}
                </button>
              </div>
            </div>
          )}

          {/* Product Grid */}
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <MagnifyingGlassIcon className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">{t('search.noResults')}</h2>
                <p className="text-gray-400 mb-6">
                  {t('search.tryDifferent')}
                </p>

                {/* Did you mean? Suggestions */}
                {isMounted && query && suggestionsQuery.data && suggestionsQuery.data.length > 0 && (
                  <div className="mt-6 p-4 bg-dark-800 rounded-lg inline-block">
                    <p className="text-gray-300 mb-3">
                      <span className="text-primary-400 font-semibold">💡 {t('search.didYouMean') || 'Bunu mu demek istediniz?'}</span>
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestionsQuery.data.map((suggestion: string, index: number) => (
                        <button
                          key={index}
                          onClick={() => {
                            setSearchTerm(suggestion);
                            router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                          }}
                          className="px-4 py-2 bg-primary-600/20 hover:bg-primary-600/40 text-primary-400 rounded-full border border-primary-500/30 transition-colors text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.map((product: {
                    id: string;
                    title: string;
                    images?: string[];
                    price?: number;
                    isTradeEnabled?: boolean;
                    isPreorder?: boolean;
                    isLimited?: boolean;
                    editionNumber?: string;
                    condition?: string;
                    category?: { name: string }
                  }) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className="bg-white rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all group shadow-sm border border-gray-200"
                    >
                      <div className="aspect-square relative bg-gray-100">
                        <OptimizedImage
                          src={product.images?.[0] || 'https://placehold.co/400x400/1a1a2e/666?text=No+Image'}
                          alt={product.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          fallbackSrc="https://placehold.co/400x400/1a1a2e/666?text=No+Image"
                          logContext={{ productId: product.id, page: 'search' }}
                        />
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          {product.isTradeEnabled && (
                            <span className="bg-orange-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                              <ArrowsRightLeftIcon className="h-3 w-3" />
                              {t('nav.trades')}
                            </span>
                          )}
                          {product.isPreorder && (
                            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                              <span className="animate-pulse">●</span>
                              {t('product.preOrder') || 'ÖN SİPARİŞ'}
                            </span>
                          )}
                          {product.isLimited && (
                            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                              <span>★</span>
                              {product.editionNumber ? `${t('product.limited') || 'LİMİTED'} (${product.editionNumber})` : (t('product.limited') || 'LİMİTED')}
                            </span>
                          )}
                        </div>
                        <button className="absolute top-2 right-2 p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-colors shadow-sm">
                          <HeartIcon className="h-5 w-5 text-gray-700" />
                        </button>
                      </div>
                      <div className="p-4">
                        <h3 className="text-gray-900 font-medium line-clamp-2 mb-2">
                          {product.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-primary-500 font-bold text-lg">
                            {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </span>
                          <span className="text-xs text-gray-600">
                            {getConditionLabel(product.condition ?? '')}
                          </span>
                        </div>
                        {product.category && (
                          <p className="text-gray-600 text-sm mt-2">
                            {product.category.name}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-8">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 bg-dark-800 text-white rounded-lg disabled:opacity-50"
                    >
                      {t('common.previous')}
                    </button>
                    <span className="px-4 py-2 text-gray-400">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 bg-dark-800 text-white rounded-lg disabled:opacity-50"
                    >
                      {t('common.next')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
