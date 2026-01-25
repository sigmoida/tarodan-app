'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { listingsApi, searchApi } from '@/lib/api';
import { useTranslation } from '@/i18n';

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
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    brand: searchParams.get('brand') || '',
    scale: searchParams.get('scale') || '',
    condition: '',
    minPrice: '',
    maxPrice: '',
    tradeOnly: false,
    sortBy: 'created_desc', // Varsayılan: En Yeni
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
    const urlCategoryId = searchParams.get('categoryId');

    // Update search query
    if (urlSearch) {
      setSearchQuery(urlSearch);
    }

    // Update filters from URL params
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
    
    if (urlCategoryId) {
      // Category filter will be handled in fetchListings via URL param
    }
  }, [searchParams]);

  useEffect(() => {
    fetchListings();
  }, [filters, searchQuery]);

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      // Get categoryId from URL if present
      const urlCategoryId = searchParams.get('categoryId');
      
      // Map condition to enum values if needed
      const conditionMap: Record<string, string> = {
        'Yeni': 'new',
        'Mükemmel': 'very_good',
        'İyi': 'good',
        'Orta': 'fair',
      };
      const mappedCondition = filters.condition 
        ? conditionMap[filters.condition] || filters.condition 
        : undefined;

      // Map sortBy to search API format
      const sortByMap: Record<string, string> = {
        'created_desc': 'newest',
        'created_asc': 'newest', // ES doesn't have oldest, use newest
        'price_asc': 'price_asc',
        'price_desc': 'price_desc',
      };

      // Use Elasticsearch when there's a search query for better fuzzy/partial matching
      if (searchQuery && searchQuery.trim()) {
        const searchParams: Record<string, any> = {
          pageSize: 100,
          page: 1,
        };
        
        if (urlCategoryId) searchParams.categoryId = urlCategoryId;
        if (mappedCondition) searchParams.condition = mappedCondition;
        if (filters.minPrice) searchParams.minPrice = Number(filters.minPrice);
        if (filters.maxPrice) searchParams.maxPrice = Number(filters.maxPrice);
        if (filters.sortBy) searchParams.sortBy = sortByMap[filters.sortBy] || 'relevance';

        const response = await searchApi.products(searchQuery.trim(), searchParams);
        // Map ES results to listing format
        const results = response.data.results || [];
        setListings(results.map((r: any) => ({
          id: r.id,
          title: r.title,
          price: r.price,
          description: r.description,
          condition: r.condition,
          images: r.imageUrl ? [{ url: r.imageUrl }] : [],
          seller: { displayName: r.sellerName },
          category: { name: r.categoryName },
          isTradeEnabled: false,
        })));
      } else {
        // Use regular products API when no search query
        const params: Record<string, any> = {
          limit: 100,
          page: 1,
        };
        
        if (urlCategoryId) params.categoryId = urlCategoryId;
        if (mappedCondition) params.condition = mappedCondition;
        if (filters.minPrice) params.minPrice = Number(filters.minPrice);
        if (filters.maxPrice) params.maxPrice = Number(filters.maxPrice);
        if (filters.brand) params.brand = filters.brand;
        if (filters.scale) params.scale = filters.scale;
        if (filters.tradeOnly) params.tradeOnly = true;
        if (filters.sortBy) params.sortBy = filters.sortBy;

        const response = await listingsApi.getAll(params);
        setListings(response.data.data || response.data.products || []);
      }
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchListings();
  };

  const clearFilters = () => {
    setFilters({
      brand: '',
      scale: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      tradeOnly: false,
      sortBy: 'created_desc',
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
      {/* Header */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 w-full">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('nav.searchPlaceholderMobile')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
            </form>

            {/* Sort Dropdown */}
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              className="px-4 py-3 border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-primary-500 transition-colors cursor-pointer"
            >
              <option value="created_desc">{t('product.sortNewest')}</option>
              <option value="created_asc">{t('product.sortOldest')}</option>
              <option value="price_asc">{t('product.sortPriceLow')}</option>
              <option value="price_desc">{t('product.sortPriceHigh')}</option>
              <option value="title_asc">A-Z</option>
              <option value="title_desc">Z-A</option>
            </select>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-3 border rounded-xl transition-colors ${
                showFilters
                  ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                  : 'bg-white border-gray-200 hover:border-primary-500'
              }`}
            >
              <FunnelIcon className="w-5 h-5" />
              <span>{t('product.filters')}</span>
              {activeFilterCount > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  showFilters
                    ? 'bg-white text-orange-500'
                    : 'bg-primary-500 text-white'
                }`}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 pt-4 border-t border-gray-100"
            >
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Brand */}
                <select
                  value={filters.brand}
                  onChange={(e) => setFilters({ ...filters, brand: e.target.value })}
                  className="input"
                >
                  <option value="">{t('product.allCategories')}</option>
                  {BRANDS.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>

                {/* Scale */}
                <select
                  value={filters.scale}
                  onChange={(e) => setFilters({ ...filters, scale: e.target.value })}
                  className="input"
                >
                  <option value="">{t('product.scale')}</option>
                  {SCALES.map((scale) => (
                    <option key={scale} value={scale}>{scale}</option>
                  ))}
                </select>

                {/* Condition */}
                <select
                  value={filters.condition}
                  onChange={(e) => setFilters({ ...filters, condition: e.target.value })}
                  className="input"
                >
                  <option value="">{t('product.condition')}</option>
                  {CONDITIONS.map((condition) => (
                    <option key={condition.value} value={condition.value}>{condition.label}</option>
                  ))}
                </select>

                {/* Price Range */}
                <input
                  type="number"
                  placeholder="Min ₺"
                  value={filters.minPrice}
                  onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                  className="input"
                />
                <input
                  type="number"
                  placeholder="Max ₺"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                  className="input"
                />

                {/* Trade Only */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.tradeOnly}
                    onChange={(e) => setFilters({ ...filters, tradeOnly: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                  />
                  <span className="text-sm">{t('product.tradeAvailable')}</span>
                </label>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-4 text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1"
                >
                  <XMarkIcon className="w-4 h-4" />
                  {t('product.clearFilters')}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Listings Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                  <div className="h-5 bg-gray-200 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg">{t('product.noListings')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {listings.map((listing, index) => (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/listings/${listing.id}`}>
                  <div className="card overflow-hidden card-hover">
                    <div className="relative aspect-square bg-gray-100">
                      <Image
                        src={getImageUrl(listing.images?.[0])}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
                        }}
                      />
                      {(listing.trade_available || listing.isTradeEnabled) && (
                        <div className="absolute top-3 left-3 badge badge-trade">
                          <ArrowsRightLeftIcon className="w-4 h-4 mr-1" />
                          {t('nav.trades')}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                        {listing.title}
                      </h3>
                      <p className="text-sm text-gray-500 mb-2">
                        {listing.brand} • {listing.scale}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-xl font-bold text-primary-500">
                          ₺{listing.price.toLocaleString('tr-TR')}
                        </p>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
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
  );
}


