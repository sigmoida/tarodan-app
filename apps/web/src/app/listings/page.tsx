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
import { listingsApi } from '@/lib/api';

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
const CONDITIONS = ['Yeni', 'Mükemmel', 'İyi', 'Orta'];

export default function ListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    brand: '',
    scale: '',
    condition: '',
    minPrice: '',
    maxPrice: '',
    tradeOnly: false,
  });

  useEffect(() => {
    const urlSearch = searchParams.get('search');
    const urlCategoryId = searchParams.get('categoryId');
    if (urlSearch) {
      setSearchQuery(urlSearch);
    }
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
      const params: Record<string, any> = {
        limit: 100, // Tüm ürünleri göster
        page: 1,
      };
      if (searchQuery) params.search = searchQuery;
      
      // Get categoryId from URL if present
      const urlCategoryId = searchParams.get('categoryId');
      if (urlCategoryId) {
        params.categoryId = urlCategoryId;
      }
      
      // Map condition to enum values if needed
      if (filters.condition) {
        const conditionMap: Record<string, string> = {
          'Yeni': 'new',
          'Mükemmel': 'very_good',
          'İyi': 'good',
          'Orta': 'fair',
        };
        params.condition = conditionMap[filters.condition] || filters.condition;
      }
      if (filters.minPrice) params.minPrice = Number(filters.minPrice);
      if (filters.maxPrice) params.maxPrice = Number(filters.maxPrice);
      if (filters.brand) params.brand = filters.brand;
      if (filters.scale) params.scale = filters.scale;
      if (filters.tradeOnly) params.tradeOnly = true;

      const response = await listingsApi.getAll(params);
      setListings(response.data.data || response.data.products || []);
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
    });
  };

  const activeFilterCount = Object.values(filters).filter(v => v).length;

  const getImageUrl = (image: any): string => {
    if (!image) return 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
    if (typeof image === 'string') return image;
    return image.url || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-16 lg:top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 w-full">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Model, marka ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                />
              </div>
            </form>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-xl hover:border-primary-500 transition-colors"
            >
              <FunnelIcon className="w-5 h-5" />
              <span>Filtreler</span>
              {activeFilterCount > 0 && (
                <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
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
                  <option value="">Tüm Markalar</option>
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
                  <option value="">Tüm Ölçekler</option>
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
                  <option value="">Tüm Durumlar</option>
                  {CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>{condition}</option>
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
                  <span className="text-sm">Sadece Takas</span>
                </label>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-4 text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Filtreleri Temizle
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
            <p className="text-gray-500 text-lg">Henüz ilan bulunamadı</p>
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
                          Takas
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


