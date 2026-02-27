'use client';

import { useState, useEffect } from 'react';
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
  StarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { listingsApi, categoriesApi } from '@/lib/api';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import { useTranslation } from '@/i18n';
import SidebarFilters from '@/components/SidebarFilters';
import ProductLayoutSelector, { ProductLayout } from '@/components/ProductLayoutSelector';

interface Listing {
  id: string | number;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  saleStartDate?: string | null;
  saleEndDate?: string | null;
  discountPercent?: number | null;
  isOnSale?: boolean;
  images: Array<{ id?: string; url: string; sortOrder?: number }> | string[];
  brand?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  } | string;
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

export default function ListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid-4');

  const [filters, setFilters] = useState({
    brand: searchParams.get('brand') || '',
    scale: searchParams.get('scale') || '',
    material: searchParams.get('material') || '',
    condition: '',
    minPrice: '',
    maxPrice: '',
    tradeOnly: false,
    discountOnly: searchParams.get('discountOnly') === 'true',
    preOrder: searchParams.get('preOrder') === 'true',
    limited: searchParams.get('limited') === 'true',
    set: searchParams.get('set') === 'true',
    sortBy: 'created_desc',
    category: searchParams.get('category') || '',
    manufacturer: searchParams.get('manufacturer') || '',
    vehicleType: searchParams.get('vehicleType') || '',
  });

  useEffect(() => {
    const urlTradeOnly = searchParams.get('tradeOnly');
    const urlDiscountOnly = searchParams.get('discountOnly');
    const urlPreOrder = searchParams.get('preOrder');
    const urlLimited = searchParams.get('limited');
    const urlSet = searchParams.get('set');
    const urlBrand = searchParams.get('brand');
    const urlScale = searchParams.get('scale');
    const urlMaterial = searchParams.get('material');
    const urlCondition = searchParams.get('condition');
    const urlMinPrice = searchParams.get('minPrice');
    const urlMaxPrice = searchParams.get('maxPrice');
    const urlSortBy = searchParams.get('sortBy');

    setFilters(prev => ({
      ...prev,
      tradeOnly: urlTradeOnly === 'true',
      discountOnly: urlDiscountOnly === 'true',
      preOrder: urlPreOrder === 'true',
      limited: urlLimited === 'true',
      set: urlSet === 'true',
      brand: urlBrand || '',
      scale: urlScale || '',
      material: urlMaterial || '',
      condition: urlCondition || '',
      minPrice: urlMinPrice || '',
      maxPrice: urlMaxPrice || '',
      sortBy: urlSortBy || 'created_desc',
    }));
    if (searchParams.get('category')) setFilters(prev => ({ ...prev, category: searchParams.get('category') || '' }));
  }, [searchParams]);

  // Resolve category slug to id when ?category=slug is in URL
  const categorySlug = filters.category || searchParams.get('category') || '';
  const { data: categoryBySlug } = useQuery({
    queryKey: ['categoryBySlug', categorySlug],
    queryFn: async () => {
      const res = await categoriesApi.findBySlug(categorySlug);
      return res.data as { id: string; name: string; slug: string };
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedCategoryId = searchParams.get('categoryId') || categoryBySlug?.id;

  // Listings Query
  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['listings', filters, resolvedCategoryId ?? ''],
    queryFn: async (): Promise<Listing[]> => {
      const urlCategoryId = resolvedCategoryId;
      const conditionMap: Record<string, string> = {
        'Yeni': 'new', 'Mükemmel': 'very_good', 'İyi': 'good', 'Orta': 'fair',
      };
      const mappedCondition = filters.condition ? conditionMap[filters.condition] || filters.condition : undefined;

      const buildListParams = (): Record<string, any> => {
        const p: Record<string, any> = { limit: 100, page: 1 };
        if (urlCategoryId) p.categoryId = urlCategoryId;
        if (mappedCondition) p.condition = mappedCondition;
        if (filters.minPrice) p.minPrice = Number(filters.minPrice);
        if (filters.maxPrice) p.maxPrice = Number(filters.maxPrice);
        if (filters.brand) p.brand = filters.brand;
        if (filters.scale) p.scale = filters.scale;
        if (filters.material) p.material = filters.material;
        if (filters.tradeOnly) p.tradeOnly = true;
        if (filters.discountOnly) p.discountOnly = true;
        if (filters.preOrder) p.preOrder = true;
        if (filters.limited) p.limited = true;
        if (filters.set) p.set = true;
        if (filters.sortBy) p.sortBy = filters.sortBy;
        if (filters.vehicleType) p.vehicleType = filters.vehicleType;
        return p;
      };

      const params = buildListParams();
      const response = await listingsApi.getAll(params);
      return response.data.data || response.data.products || [];
    },
    meta: { page: 'listings' },
  });

  const clearFilters = () => {
    setFilters({
      brand: '', scale: '', material: '', condition: '', minPrice: '', maxPrice: '',
      tradeOnly: false, discountOnly: false, preOrder: false, limited: false, set: false, sortBy: 'created_desc', category: '', manufacturer: '', vehicleType: '',
    });
  };

  const activeFilterCount = Object.entries(filters)
    .filter(([key, value]) => key !== 'sortBy' && value !== '' && value !== false).length;

  const getImageUrl = (image: any): string => {
    if (!image) return 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
    if (typeof image === 'string') return image;
    return image.url || 'https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <h1 className="sr-only">
        {filters.category ? `${filters.category} Diecast Model Arabalar` :
          filters.brand ? `${filters.brand} Model Araç Koleksiyonu` : t('product.title')}
      </h1>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar Filters (Desktop) */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white rounded-xl border border-gray-100 shadow-soft">
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
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl flex flex-col overflow-y-auto">
                <div className="flex-shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100 z-10">
                  <span className="font-semibold text-gray-900">{t('product.filters')}</span>
                  <button onClick={() => setShowMobileSidebar(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
                  <SidebarFilters
                    filters={filters}
                    onFilterChange={setFilters}
                    activeFilterCount={activeFilterCount}
                    onClearFilters={clearFilters}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Results Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  <FunnelIcon className="w-5 h-5" />
                  <span>{t('product.filters')}</span>
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">{activeFilterCount}</span>
                  )}
                </button>
                <p className="text-base font-semibold text-gray-900">
                  {listings.length} <span className="font-normal text-gray-500">ürün bulundu</span>
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
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
                  <option value="view_count_desc">{t('product.sortPopular')}</option>
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
                {[
                  { k: 'category', v: filters.category }, { k: 'brand', v: filters.brand },
                  { k: 'scale', v: filters.scale }, { k: 'material', v: filters.material }, { k: 'condition', v: filters.condition },
                  { k: 'manufacturer', v: filters.manufacturer }
                ].map(f => f.v && (
                  <span key={f.k} className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    {f.k === 'material' ? ({ diecast: 'Diecast (Metal)', resin: 'Resin (Reçine)', composite: 'Composite', plastic: 'Plastic' }[f.v] || f.v) : f.v}
                    <button onClick={() => setFilters({ ...filters, [f.k]: '' })} className="hover:text-orange-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                ))}
                {(filters.minPrice || filters.maxPrice) && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">
                    ₺{filters.minPrice || '0'} - ₺{filters.maxPrice || '∞'}
                    <button onClick={() => setFilters({ ...filters, minPrice: '', maxPrice: '' })} className="hover:text-orange-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                )}
                {filters.tradeOnly && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm rounded-full">
                    {t('product.tradeAvailable')}
                    <button onClick={() => setFilters({ ...filters, tradeOnly: false })} className="hover:text-emerald-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                )}
                {filters.preOrder && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-violet-100 text-violet-700 text-sm rounded-full">
                    {t('product.preOrder')}
                    <button onClick={() => setFilters({ ...filters, preOrder: false })} className="hover:text-violet-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                )}
                {filters.limited && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 text-sm rounded-full">
                    {t('product.limitedEdition')}
                    <button onClick={() => setFilters({ ...filters, limited: false })} className="hover:text-amber-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                )}
                {filters.set && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-700 text-sm rounded-full">
                    {t('product.sets')}
                    <button onClick={() => setFilters({ ...filters, set: false })} className="hover:text-sky-900"><XMarkIcon className="w-4 h-4" /></button>
                  </span>
                )}
                <button onClick={clearFilters} className="text-sm text-orange-600 hover:text-orange-700 font-medium">{t('product.clearFilters')}</button>
              </div>
            )}

            <div className="border-b border-gray-200 pb-4 mb-6" />

            {/* GRID */}
            {isLoading ? (
              <div className={
                productLayout === 'grid-3' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' :
                  productLayout === 'grid-4' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6' :
                    productLayout === 'grid-6' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4' : 'space-y-3'
              }>
                {[...Array(12)].map((_, i) => (
                  <div key={i} className={`card animate-pulse ${productLayout === 'list' ? 'flex gap-4' : 'aspect-square'} bg-gray-200 rounded-lg h-60`}></div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-50 rounded-full mb-4">
                  <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 text-lg mb-2">{t('product.noListings')}</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">{t('product.clearFilters')}</button>
                )}
              </div>
            ) : productLayout === 'list' ? (
              <div className="space-y-3">
                {listings.map((listing, index) => (
                  <motion.div key={listing.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
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
                            <div className="absolute top-1 right-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5"><ArrowsRightLeftIcon className="w-3 h-3" /></div>
                          )}
                        </div>
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">{listing.title}</h3>
                            <p className="text-sm text-gray-500 mb-1">
                              {typeof listing.brand === 'object' ? listing.brand.name : listing.brand} • {listing.scale}
                            </p>
                            {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                              <div className="flex items-center gap-1"><StarIconSolid className="w-3.5 h-3.5 text-yellow-400" /><span className="text-xs font-semibold text-gray-900">{listing.rating.average.toFixed(1)}</span><span className="text-xs text-gray-500">({listing.rating.count})</span></div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 ml-4">
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">{listing.condition}</span>
                            <div className="flex flex-col items-end">
                              {isProductOnSaleDisplay(listing) && (
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs text-gray-400 line-through">{getProductOriginalPriceForDisplay(listing).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-1 py-0.5 rounded">%{listing.discountPercent ?? 0}</span>
                                </div>
                              )}
                              <p className="text-lg font-bold text-primary-500 whitespace-nowrap">{getProductEffectivePrice(listing).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className={
                productLayout === 'grid-3' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' :
                  productLayout === 'grid-4' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4' :
                    'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
              }>
                {listings.map((listing, index) => (
                  <motion.div key={listing.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                    <Link href={`/listings/${listing.id}`}>
                      <div className="bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all group h-full flex flex-col">
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
                            <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1"><ArrowsRightLeftIcon className="w-3 h-3" /><span className="hidden sm:inline">{t('nav.trades')}</span></div>
                          )}
                          {isProductOnSaleDisplay(listing) && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
                              %{listing.discountPercent ?? 0} {t('product.discount') || 'İndirim'}
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex-1 flex flex-col">
                          <h3 className="font-semibold text-gray-900 line-clamp-2 text-sm mb-1 group-hover:text-orange-600 transition-colors">{listing.title}</h3>
                          <p className="text-xs text-gray-500 mb-2">
                            {typeof listing.brand === 'object' ? listing.brand.name : listing.brand} • {listing.scale}
                          </p>
                          {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                            <div className="flex items-center gap-1 mb-2">
                              <StarIconSolid className="w-3.5 h-3.5 text-yellow-400" /><span className="text-xs font-semibold text-gray-900">{listing.rating.average.toFixed(1)}</span>
                              <span className="text-xs text-gray-400">({listing.rating.count})</span>
                            </div>
                          )}
                          <div className="mt-auto pt-2 border-t border-gray-100 space-y-1">
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded inline-block">{listing.condition}</span>
                            <div className="flex flex-col">
                              {isProductOnSaleDisplay(listing) && (
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-xs text-gray-400 line-through">{getProductOriginalPriceForDisplay(listing).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
                                  <span className="text-xs font-semibold text-red-500 bg-red-50 px-1 py-0.5 rounded">%{listing.discountPercent ?? 0}</span>
                                </div>
                              )}
                              <p className="text-lg font-bold text-orange-600">{getProductEffectivePrice(listing).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</p>
                            </div>
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
