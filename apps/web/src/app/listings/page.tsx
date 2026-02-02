'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  ClockIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { listingsApi, searchApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { useRecentSearchesStore } from '@/stores/recentSearchesStore';
import SidebarFilters from '@/components/SidebarFilters';
import { Bars3Icon } from '@heroicons/react/24/solid';
import ProductLayoutSelector, { ProductLayout } from '@/components/ProductLayoutSelector';

interface Listing {
  id: string | number;
  title: string;
  price: number;
  images: Array<{ id?: string; url: string; sortOrder?: number }> | string[];
  brand?: string;
  scale?: string;
  condition: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  rating?: {
    average: number | null;
    count: number;
  };
  seller?: {
    id: string | number;
    displayName?: string;
    username?: string;
    rating?: number;
  };
}

const BRANDS = ['Hot Wheels', 'Matchbox', 'Majorette', 'Tomica', 'Minichamps', 'AutoArt'];
const SCALES = ['1:18', '1:24', '1:43', '1:64'];

export default function ListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const CONDITIONS = [
    { value: 'Yeni', label: t('product.conditionNew') },
    { value: 'Mükemmel', label: t('product.conditionVeryGood') },
    { value: 'İyi', label: t('product.conditionGood') },
    { value: 'Orta', label: t('product.conditionFair') },
  ];
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid-4');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recentSearchesRef = useRef<HTMLDivElement>(null);

  // Recent searches store
  const { searches: recentSearches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();

  const [filters, setFilters] = useState({
    brand: searchParams.get('brand') || '',
    scale: searchParams.get('scale') || '',
    condition: '',
    minPrice: '',
    maxPrice: '',
    tradeOnly: false,
    sortBy: 'created_desc', // Varsayılan: En Yeni
    category: searchParams.get('category') || '',
    manufacturer: searchParams.get('manufacturer') || '',
  });

  useEffect(() => {
    const urlSearch = searchParams.get('search');
    const urlTradeOnly = searchParams.get('tradeOnly');
    const urlBrand = searchParams.get('brand');
    const urlScale = searchParams.get('scale');
    const urlCondition = searchParams.get('condition');
    const urlMinPrice = searchParams.get('minPrice');
    const urlMaxPrice = searchParams.get('maxPrice');
    const urlSortBy = searchParams.get('sortBy');

    if (urlSearch) setSearchQuery(urlSearch);
    setFilters(prev => ({
      ...prev,
      tradeOnly: urlTradeOnly === 'true',
      brand: urlBrand || '',
      scale: urlScale || '',
      condition: urlCondition || '',
      minPrice: urlMinPrice || '',
      maxPrice: urlMaxPrice || '',
      sortBy: urlSortBy || 'created_desc',
    }));
  }, [searchParams]);

  // Listings: React Query (cache + global error logging)
  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['listings', searchQuery, filters, searchParams.get('categoryId') ?? ''],
    queryFn: async (): Promise<Listing[]> => {
      const urlCategoryId = searchParams.get('categoryId');
      const conditionMap: Record<string, string> = {
        'Yeni': 'new',
        'Mükemmel': 'very_good',
        'İyi': 'good',
        'Orta': 'fair',
      };
      const mappedCondition = filters.condition ? conditionMap[filters.condition] || filters.condition : undefined;
      const sortByMap: Record<string, string> = {
        'created_desc': 'newest',
        'created_asc': 'oldest',
        'price_asc': 'price_asc',
        'price_desc': 'price_desc',
      };

      if (searchQuery?.trim()) {
        try {
          const esParams: Record<string, any> = { pageSize: 100, page: 1 };
          if (urlCategoryId) esParams.categoryId = urlCategoryId;
          if (mappedCondition) esParams.condition = mappedCondition;
          if (filters.minPrice) esParams.minPrice = Number(filters.minPrice);
          if (filters.maxPrice) esParams.maxPrice = Number(filters.maxPrice);
          if (filters.sortBy) esParams.sortBy = sortByMap[filters.sortBy] || 'relevance';
          const response = await searchApi.products(searchQuery.trim(), esParams);
          const results = response.data.results || response.data.data || [];
          if (results.length > 0) {
            return results.map((r: any) => ({
              id: r.id,
              title: r.title,
              price: r.price,
              description: r.description,
              condition: r.condition,
              images: r.imageUrl ? [{ url: r.imageUrl }] : (r.images || []),
              seller: r.seller || { displayName: r.sellerName },
              category: { name: r.categoryName },
              isTradeEnabled: r.isTradeEnabled || r.trade_available || false,
              rating: r.rating || (r.averageRating ? { average: r.averageRating, count: r.ratingCount || 0 } : undefined),
            }));
          }
          const dbParams: Record<string, any> = { limit: 100, page: 1, search: searchQuery.trim() };
          if (urlCategoryId) dbParams.categoryId = urlCategoryId;
          if (mappedCondition) dbParams.condition = mappedCondition;
          if (filters.minPrice) dbParams.minPrice = Number(filters.minPrice);
          if (filters.maxPrice) dbParams.maxPrice = Number(filters.maxPrice);
          if (filters.brand) dbParams.brand = filters.brand;
          if (filters.scale) dbParams.scale = filters.scale;
          if (filters.tradeOnly) dbParams.tradeOnly = true;
          if (filters.sortBy) dbParams.sortBy = filters.sortBy;
          const dbResponse = await listingsApi.getAll(dbParams);
          return dbResponse.data.data || dbResponse.data.products || [];
        } catch {
          const dbParams: Record<string, any> = { limit: 100, page: 1, search: searchQuery.trim() };
          if (urlCategoryId) dbParams.categoryId = urlCategoryId;
          if (mappedCondition) dbParams.condition = mappedCondition;
          if (filters.minPrice) dbParams.minPrice = Number(filters.minPrice);
          if (filters.maxPrice) dbParams.maxPrice = Number(filters.maxPrice);
          if (filters.brand) dbParams.brand = filters.brand;
          if (filters.scale) dbParams.scale = filters.scale;
          if (filters.tradeOnly) dbParams.tradeOnly = true;
          if (filters.sortBy) dbParams.sortBy = filters.sortBy;
          const dbResponse = await listingsApi.getAll(dbParams);
          return dbResponse.data.data || dbResponse.data.products || [];
        }
      }
      const params: Record<string, any> = { limit: 100, page: 1 };
      if (urlCategoryId) params.categoryId = urlCategoryId;
      if (mappedCondition) params.condition = mappedCondition;
      if (filters.minPrice) params.minPrice = Number(filters.minPrice);
      if (filters.maxPrice) params.maxPrice = Number(filters.maxPrice);
      if (filters.brand) params.brand = filters.brand;
      if (filters.scale) params.scale = filters.scale;
      if (filters.tradeOnly) params.tradeOnly = true;
      if (filters.sortBy) params.sortBy = filters.sortBy;
      const response = await listingsApi.getAll(params);
      return response.data.data || response.data.products || [];
    },
    meta: { page: 'listings' },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) addSearch(searchQuery.trim());
    setShowRecentSearches(false);
  };

  const handleRecentSearchClick = (query: string) => {
    setSearchQuery(query);
    setShowRecentSearches(false);
    // Trigger search with the selected query
    addSearch(query);
    // Update URL and fetch
    const params = new URLSearchParams(window.location.search);
    params.set('search', query);
    router.push(`/listings?${params.toString()}`);
  };

  // Close recent searches dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        recentSearchesRef.current &&
        !recentSearchesRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowRecentSearches(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearFilters = () => {
    setFilters({
      brand: '',
      scale: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      tradeOnly: false,
      sortBy: 'created_desc',
      category: '',
      manufacturer: '',
    });
  };

  // Count only actual filters (exclude sortBy as it's a sorting option, not a filter)
  const activeFilterCount = Object.entries(filters)
    .filter(([key, value]) => key !== 'sortBy' && value !== '' && value !== false)
    .length;

  const getImageUrl = (image: any): string => {
    if (!image) return 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
    if (typeof image === 'string') return image;
    return image.url || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* SEO H1 - Screen reader only */}
      <h1 className="sr-only">
        {filters.category ? `${filters.category} Diecast Model Arabalar` :
          filters.brand ? `${filters.brand} Model Araç Koleksiyonu` :
            filters.scale ? `${filters.scale} Ölçek Model Araçlar` :
              searchQuery ? `"${searchQuery}" Arama Sonuçları` :
                t('product.title')}
      </h1>

      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Search with Recent Searches */}
            <form onSubmit={handleSearch} className="flex-1 w-full relative" role="search" aria-label="Ürün ara">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('nav.searchPlaceholderMobile')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowRecentSearches(true)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>

              {/* Recent Searches Dropdown */}
              {showRecentSearches && recentSearches.length > 0 && (
                <div
                  ref={recentSearchesRef}
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      <ClockIcon className="w-4 h-4" />
                      {t('search.recentSearches')}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        clearSearches();
                      }}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      {t('search.clearAll')}
                    </button>
                  </div>
                  <ul>
                    {recentSearches.map((query, index) => (
                      <li key={index}>
                        <button
                          type="button"
                          onClick={() => handleRecentSearchClick(query)}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-orange-50 flex items-center justify-between group"
                        >
                          <span className="flex items-center gap-2">
                            <ClockIcon className="w-4 h-4 text-gray-400" />
                            {query}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSearch(query);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>


          </div>


        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Desktop Sidebar Filters */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24">
              <SidebarFilters
                filters={filters}
                onFilterChange={setFilters}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />
            </div>
          </div>

          {/* Mobile Sidebar Overlay */}
          {showMobileSidebar && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setShowMobileSidebar(false)}
              />
              <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl overflow-y-auto">
                <div className="sticky top-0 flex items-center justify-between p-4 bg-white border-b border-gray-100 z-10">
                  <span className="font-semibold text-gray-900">{t('product.filters')}</span>
                  <button
                    onClick={() => setShowMobileSidebar(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
                  <SidebarFilters
                    filters={filters}
                    onFilterChange={(newFilters) => {
                      setFilters(newFilters);
                    }}
                    activeFilterCount={activeFilterCount}
                    onClearFilters={clearFilters}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Products Grid */}
          <div className="flex-1 min-w-0">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {/* Mobile Filter Button */}
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  <FunnelIcon className="w-5 h-5" />
                  <span>{t('product.filters')}</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{listings.length}</span> ürün bulundu
                </p>
              </div>

              <div className="flex items-center gap-3">
                <ProductLayoutSelector
                  layout={productLayout}
                  onLayoutChange={setProductLayout}
                  storageKey="listings-product-layout"
                />
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                  className="px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:border-orange-400"
                >
                  <option value="created_desc">{t('product.sortNewest')}</option>
                  <option value="created_asc">{t('product.sortOldest')}</option>
                  <option value="price_asc">{t('product.sortPriceLow')}</option>
                  <option value="price_desc">{t('product.sortPriceHigh')}</option>
                  <option value="title_asc">A-Z</option>
                  <option value="title_desc">Z-A</option>
                </select>
              </div>
            </div>

            {/* Active Filters Pills */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {filters.category && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {filters.category}
                    <button onClick={() => setFilters({ ...filters, category: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {filters.brand && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {filters.brand}
                    <button onClick={() => setFilters({ ...filters, brand: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {filters.scale && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {filters.scale}
                    <button onClick={() => setFilters({ ...filters, scale: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {filters.manufacturer && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {filters.manufacturer}
                    <button onClick={() => setFilters({ ...filters, manufacturer: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {filters.condition && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {filters.condition}
                    <button onClick={() => setFilters({ ...filters, condition: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {(filters.minPrice || filters.maxPrice) && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    ₺{filters.minPrice || '0'} - ₺{filters.maxPrice || '∞'}
                    <button onClick={() => setFilters({ ...filters, minPrice: '', maxPrice: '' })} className="hover:text-orange-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                {filters.tradeOnly && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm rounded-full">
                    {t('product.tradeAvailable')}
                    <button onClick={() => setFilters({ ...filters, tradeOnly: false })} className="hover:text-emerald-900">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </span>
                )}
                <button
                  onClick={clearFilters}
                  className="text-sm text-orange-600 hover:text-orange-700 font-medium"
                >
                  {t('product.clearFilters')}
                </button>
              </div>
            )}

            {/* Products */}
            {isLoading ? (
              <div className={
                productLayout === 'grid-4'
                  ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'
                  : productLayout === 'grid-6'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                    : 'space-y-3'
              }>
                {[...Array(12)].map((_, i) => (
                  <div key={i} className={productLayout === 'list' ? 'card animate-pulse flex gap-4' : 'card animate-pulse'}>
                    <div className={productLayout === 'list' ? 'w-32 h-32 bg-gray-200 rounded-lg flex-shrink-0' : 'aspect-square bg-gray-200'} />
                    <div className={productLayout === 'list' ? 'flex-1 space-y-2' : 'p-4 space-y-2'}>
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-5 bg-gray-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-gray-500 text-lg mb-2">{t('product.noListings')}</p>
                <p className="text-gray-400 text-sm">Filtreleri değiştirmeyi veya arama terimini güncellemeyi deneyin</p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    {t('product.clearFilters')}
                  </button>
                )}
              </div>
            ) : productLayout === 'list' ? (
              <div className="space-y-3">
                {listings.map((listing, index) => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link href={`/listings/${listing.id}`}>
                      <div className="bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-all flex gap-4 p-4">
                        <div className="relative w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                          <OptimizedImage
                            src={getImageUrl(listing.images?.[0])}
                            alt={listing.title}
                            fill
                            className="object-cover"
                            fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                            logContext={{ listingId: listing.id, page: 'listings' }}
                            priority={index === 0}
                          />
                          {(listing.trade_available || listing.isTradeEnabled) && (
                            <div className="absolute top-1 right-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ArrowsRightLeftIcon className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">
                              {listing.title}
                            </h3>
                            <p className="text-sm text-gray-500 mb-1">
                              {listing.brand} • {listing.scale}
                            </p>
                            {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                              <div className="flex items-center gap-1">
                                <StarIconSolid className="w-3.5 h-3.5 text-yellow-400" />
                                <span className="text-xs font-semibold text-gray-900">
                                  {listing.rating.average.toFixed(1)}
                                </span>
                                <span className="text-xs text-gray-500">
                                  ({listing.rating.count})
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 ml-4">
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                              {listing.condition}
                            </span>
                            <p className="text-lg font-bold text-primary-500 whitespace-nowrap">
                              {listing.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className={
                productLayout === 'grid-4'
                  ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4'
                  : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
              }>
                {listings.map((listing, index) => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link href={`/listings/${listing.id}`}>
                      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all group">
                        <div className="relative aspect-square bg-gray-100">
                          <OptimizedImage
                            src={getImageUrl(listing.images?.[0])}
                            alt={listing.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                            logContext={{ listingId: listing.id, page: 'listings' }}
                            priority={index < 4}
                          />
                          {(listing.trade_available || listing.isTradeEnabled) && (
                            <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <ArrowsRightLeftIcon className="w-3 h-3" />
                              <span className="hidden sm:inline">{t('nav.trades')}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="font-semibold text-gray-900 line-clamp-2 text-sm mb-1 group-hover:text-orange-600 transition-colors">
                            {listing.title}
                          </h3>
                          <p className="text-xs text-gray-500 mb-2">
                            {listing.brand} • {listing.scale}
                          </p>
                          {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                            <div className="flex items-center gap-1 mb-2">
                              <StarIconSolid className="w-3.5 h-3.5 text-yellow-400" />
                              <span className="text-xs font-semibold text-gray-900">
                                {listing.rating.average.toFixed(1)}
                              </span>
                              <span className="text-xs text-gray-400">({listing.rating.count})</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <p className="text-lg font-bold text-orange-600">
                              {listing.price.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺
                            </p>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              {listing.condition}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


