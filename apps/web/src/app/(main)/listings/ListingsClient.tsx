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
  XMarkIcon,
  StarIcon,
  TagIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { listingsApi, categoriesApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import {
  PAGE_LIMIT,
  detectBrand,
  parseListingsFilters,
  getListingsPage,
  buildListApiParams,
  type Filters,
} from './_lib/params';
import { ProductCard } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { formatCondition } from '@/lib/format';
import SidebarFilters from '@/components/SidebarFilters';
import ProductLayoutSelector, { ProductLayout } from '@/components/ProductLayoutSelector';
import { Button, Select } from '@tarodan/ui';

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
  isBoosted?: boolean;
  status?: string | null;
  availableQuantity?: number | null;
  images: Array<{ id?: string; url?: string; cardUrl?: string; detailUrl?: string; sortOrder?: number }> | string[];
  brand?: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  } | string;
  scale?: string;
  year?: number | string;
  condition: string;
  trade_available?: boolean;
  isTradeEnabled?: boolean;
  rating?: {
    average: number | null;
    count: number;
  };
  viewCount?: number;
  likeCount?: number;
  seller?: {
    id: string | number;
    displayName?: string;
    username?: string;
    rating?: number;
  };
}

export default function ListingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useTranslation();

  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  // Navbar + CategoryNavBar aşağı kaydırınca gizlenir; filtre kutusunun sticky
  // top değerini buna göre ayarla ki çubuklar gizliyken üstte boşluk kalmasın.
  const [barsHidden, setBarsHidden] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid-6');
  const [currentPage, setCurrentPage] = useState(() =>
    getListingsPage(new URLSearchParams(searchParams.toString())),
  );
  const pageLimit = PAGE_LIMIT;

  // Initial filters are parsed by the SAME shared function the server page uses,
  // so the first-render query key matches the server's seed (no refetch flash).
  const [filters, setFilters] = useState<Filters>(() =>
    parseListingsFilters(new URLSearchParams(searchParams.toString())),
  );

  const searchString = searchParams.toString();

  const normalizeParams = (p: URLSearchParams): string => {
    const sorted = new URLSearchParams(Array.from(p.entries()).sort((a, b) => a[0].localeCompare(b[0])));
    return sorted.toString();
  };

  const buildParamsFromFilters = (f: typeof filters, page: number) => {
    const params = new URLSearchParams();
    if (f.search) params.set('search', f.search);
    if (f.brand) params.set('brand', f.brand);
    if (f.brandId) params.set('brandId', f.brandId);
    if (f.carModel) params.set('carModel', f.carModel);
    if (f.carModelId) params.set('carModelId', f.carModelId);
    if (f.scale) params.set('scale', f.scale);
    if (f.material) params.set('material', f.material);
    if (f.condition) params.set('condition', f.condition);
    if (f.minPrice) params.set('minPrice', f.minPrice);
    if (f.maxPrice) params.set('maxPrice', f.maxPrice);
    if (f.tradeOnly) params.set('tradeOnly', 'true');
    if (f.discountOnly) params.set('discountOnly', 'true');
    if (f.preOrder) params.set('preOrder', 'true');
    if (f.limited) params.set('limited', 'true');
    if (f.set) params.set('set', 'true');
    if (f.sortBy && f.sortBy !== 'relevance') params.set('sortBy', f.sortBy);
    if (f.category) params.set('category', f.category);
    if (f.categoryId) params.set('categoryId', f.categoryId);
    if (f.manufacturer) params.set('manufacturer', f.manufacturer);
    if (f.manufacturerId) params.set('manufacturerId', f.manufacturerId);
    // Encode manufacturer-scoped attribute selections as attr.<groupSlug>=a,b,c
    if (f.customAttributes) {
      for (const [groupSlug, slugs] of Object.entries(f.customAttributes)) {
        if (slugs && slugs.length > 0) params.set(`attr.${groupSlug}`, slugs.join(','));
      }
    }
    if (page > 1) params.set('page', page.toString());
    return params;
  };

  const lastScrollY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setBarsHidden(y > lastScrollY.current && y > 80);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const hasSyncedToUrl = useRef(false);
  useEffect(() => {
    if (!hasSyncedToUrl.current) {
      hasSyncedToUrl.current = true;
      return;
    }
    const nextParams = buildParamsFromFilters(filters, currentPage);
    const currentParams = new URLSearchParams(searchString);
    if (normalizeParams(nextParams) !== normalizeParams(currentParams)) {
      const nextStr = nextParams.toString();
      const newUrl = nextStr ? `/listings?${nextStr}` : '/listings';
      router.replace(newUrl);
    }
  }, [filters, currentPage]);

  useEffect(() => {
    const newSearch = searchParams.get('search') || '';
    const detectedBrand = detectBrand(newSearch);
    const page = getListingsPage(new URLSearchParams(searchString));
    setCurrentPage(page);

    setFilters(prev => {
      const next = {
        ...prev,
        search: detectedBrand ? '' : newSearch,
        tradeOnly: searchParams.get('tradeOnly') === 'true',
        discountOnly: searchParams.get('discountOnly') === 'true',
        preOrder: searchParams.get('preOrder') === 'true',
        limited: searchParams.get('limited') === 'true',
        set: searchParams.get('set') === 'true',
        brand: searchParams.get('brand') || detectedBrand || '',
        brandId: searchParams.get('brandId') || '',
        carModelId: searchParams.get('carModelId') || '',
        carModel: searchParams.get('carModel') || '',
        scale: searchParams.get('scale') || '',
        material: searchParams.get('material') || '',
        condition: searchParams.get('condition') || '',
        minPrice: searchParams.get('minPrice') || '',
        maxPrice: searchParams.get('maxPrice') || '',
        sortBy: searchParams.get('sortBy') || prev.sortBy || 'relevance',
        category: searchParams.get('category') || '',
        categoryId: searchParams.get('categoryId') || '',
        manufacturer: searchParams.get('manufacturer') || '',
        manufacturerId: searchParams.get('manufacturerId') || '',
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).some(k => prev[k] !== next[k]);
      return changed ? next : prev;
    });
  }, [searchString]);

  const categorySlug = filters.category || searchParams.get('category') || '';
  const { data: categoryBySlug } = useQuery({
    queryKey: queryKeys.category.bySlug(categorySlug),
    queryFn: async () => {
      const res = await categoriesApi.findBySlug(categorySlug);
      return res.data as { id: string; name: string; slug: string };
    },
    enabled: !!categorySlug,
    staleTime: 5 * 60 * 1000,
  });
  const resolvedCategoryId = searchParams.get('categoryId') || categoryBySlug?.id;

  // Filters for sidebar: merge resolved category when coming from slug (navbar)
  const filtersForSidebar = {
    ...filters,
    categoryId: resolvedCategoryId || filters.categoryId,
    category: (resolvedCategoryId && categoryBySlug?.name) ? categoryBySlug.name : filters.category,
  };

  const { data: listingsData, isLoading } = useQuery({
    queryKey: queryKeys.listings.list(filters, resolvedCategoryId, currentPage),
    queryFn: async () => {
      // buildListApiParams is the SINGLE source of truth for the /products query,
      // shared with the server page so the seeded first page matches this refetch.
      const params = buildListApiParams(filters, resolvedCategoryId, currentPage, pageLimit);
      const response = await listingsApi.getAll(params);
      const raw = response?.data;
      const listings = Array.isArray(raw) ? raw : (raw?.data ?? raw?.products ?? []);
      const meta = raw?.meta || { total: listings.length, page: currentPage, limit: pageLimit, totalPages: 1 };
      return { listings, meta };
    },
    meta: { page: 'listings' },
  });

  const listings: Listing[] = listingsData?.listings ?? [];
  const pagination = listingsData?.meta ?? { total: 0, page: currentPage, limit: pageLimit, totalPages: 1 };

  const handleFiltersChange = (nextFilters: typeof filters) => {
    setFilters(nextFilters);
    setCurrentPage(1);
    // URL sync is handled by useEffect [filters, currentPage]
  };

  const clearFilters = () => {
    setFilters({
      search: '', brand: '', brandId: '', carModelId: '', carModel: '', scale: '', material: '', condition: '', minPrice: '', maxPrice: '',
      tradeOnly: false, discountOnly: false, preOrder: false, limited: false, set: false,
      sortBy: 'relevance', category: '', categoryId: '', manufacturer: '', manufacturerId: '',
      customAttributes: {},
    });
    setCurrentPage(1);
    // URL sync is handled by useEffect [filters, currentPage]
  };

  // Read search query directly from URL so display is always in sync regardless of state timing
  const currentSearch = searchParams.get('search') || '';

  // Count active filters; paired keys (e.g. manufacturer+manufacturerId) count as 1.
  // Uses currentSearch (from URL) so the count is accurate even before state syncs.
  const activeFilterCount = (() => {
    const pairs: [string, string][] = [
      ['manufacturer', 'manufacturerId'],
      ['brand', 'brandId'],
      ['category', 'categoryId'],
      ['carModel', 'carModelId'],
    ];
    const exclude = new Set(['sortBy', 'search']);
    let count = currentSearch ? 1 : 0;
    const counted = new Set<string>();
    for (const [k, v] of Object.entries(filters)) {
      if (exclude.has(k) || v === '' || v === false) continue;
      const pair = pairs.find(([a, b]) => a === k || b === k);
      if (pair && !counted.has(pair[0] + pair[1])) {
        const hasEither = filters[pair[0] as keyof typeof filters] || filters[pair[1] as keyof typeof filters];
        if (hasEither) {
          count += 1;
          counted.add(pair[0] + pair[1]);
        }
      } else if (!pair) {
        if (k === 'minPrice' || k === 'maxPrice') {
          if (!counted.has('price') && (filters.minPrice || filters.maxPrice)) {
            count += 1;
            counted.add('price');
          }
        } else if (k === 'customAttributes') {
          // Count each non-empty custom attribute group (e.g. each Hot Wheels attribute filter).
          if (v && typeof v === 'object') {
            for (const sel of Object.values(v as Record<string, string[]>)) {
              if (Array.isArray(sel) && sel.length > 0) count += 1;
            }
          }
        } else {
          count += 1;
        }
      }
    }
    return count;
  })();

  const LISTING_PLACEHOLDERS = [
    'https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels',
    'https://placehold.co/400x400/e3f2fd/1565c0?text=Diecast+Model',
    'https://placehold.co/400x400/fce4ec/c62828?text=Koleksiyon',
    'https://placehold.co/400x400/e8f5e9/2e7d32?text=Model+Araba',
    'https://placehold.co/400x400/f3e5f5/6a1b9a?text=Premium',
    'https://placehold.co/400x400/fff8e1/f57f17?text=Rare+Model',
  ];
  const getImageUrl = (image: any, index?: number, productTitle?: string): string => {
    const placeholder = LISTING_PLACEHOLDERS[(index ?? 0) % LISTING_PLACEHOLDERS.length];
    const url = image?.cardUrl ?? image?.detailUrl ?? (typeof image === 'string' ? image : image?.url);
    if (url && !url.includes('picsum.photos')) return url;
    if (url && url.includes('picsum.photos') && productTitle) {
      return `https://placehold.co/800x600/1a1a2e/eee?text=${encodeURIComponent(productTitle.substring(0, 25).trim())}`;
    }
    return placeholder;
  };

  const getGridClass = () => {
    switch (productLayout) {
      case 'grid-3': return 'grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4';
      case 'grid-4': return 'grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-4';
      case 'grid-6': return 'grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-3';
      default: return 'space-y-2';
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <h1 className="sr-only">
        {currentSearch
          ? (locale === 'en' ? `Search results for ${currentSearch}` : `${currentSearch} arama sonuçları`)
          : filters.category
            ? `${filters.category} Diecast Model Arabalar`
            : filters.brand
              ? `${filters.brand} Model Araç Koleksiyonu`
              : t('product.title')}
      </h1>

      {/* Page Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-3 sm:px-6 lg:px-12 xl:px-16 py-4 sm:py-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-heading flex items-center gap-2 truncate">
                  <div className="w-1 h-6 bg-primary-500 rounded-sm flex-shrink-0" />
                  <span className="truncate">
                    {currentSearch
                      ? (locale === 'en' ? `Results for "${currentSearch}"` : `"${currentSearch}" araması`)
                      : filters.brand || filters.category || (locale === 'en' ? 'All Listings' : 'Tüm İlanlar')}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-muted mt-0.5">
                  {pagination.total} {locale === 'en' ? 'products found' : 'ürün bulundu'}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setShowMobileSidebar(true)}
                className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-elevated border border-border rounded text-xs sm:text-sm font-medium hover:bg-surface transition-colors flex-shrink-0 ml-2">
                <FunnelIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('product.filters')}</span>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary-500 text-inverted text-[10px] font-bold rounded-sm">{activeFilterCount}</span>
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              <ProductLayoutSelector
                layout={productLayout}
                onLayoutChange={setProductLayout}
                storageKey="listings-product-layout"
              />
              <Select
                value={filters.sortBy}
                onChange={(e) => handleFiltersChange({ ...filters, sortBy: e.target.value })}
                className="w-auto flex-shrink-0"
                selectSize="sm"
              >
                <option value="relevance">{locale === 'en' ? 'Recommended' : 'Önerilen'}</option>
                <option value="created_desc">{t('product.sortNewest')}</option>
                <option value="created_asc">{t('product.sortOldest')}</option>
                <option value="view_count_desc">{t('product.sortPopular')}</option>
                <option value="price_asc">{t('product.sortPriceLow')}</option>
                <option value="price_desc">{t('product.sortPriceHigh')}</option>
                <option value="rating_desc">{locale === 'en' ? 'Highest Rating' : 'En yüksek puan'}</option>
                <option value="title_asc">A-Z</option>
                <option value="title_desc">Z-A</option>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto px-3 sm:px-6 lg:px-12 xl:px-16 py-4 sm:py-5">
        <div className="flex gap-6">
          {/* Sidebar Filters (Desktop) */}
          <div className="hidden lg:block w-56 flex-shrink-0">
            <div
              className="sticky overflow-y-auto bg-surface-elevated rounded border border-border transition-[top] duration-300"
              style={{
                top: barsHidden ? 8 : 116,
                maxHeight: `calc(100vh - ${barsHidden ? 16 : 124}px)`,
              }}
            >
              <SidebarFilters
                filters={filtersForSidebar}
                onFilterChange={handleFiltersChange}
                activeFilterCount={activeFilterCount}
                onClearFilters={clearFilters}
              />
            </div>
          </div>

          {/* Mobile Sidebar Overlay */}
          {showMobileSidebar && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-heading/50" onClick={() => setShowMobileSidebar(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-surface-elevated shadow-xl flex flex-col overflow-y-auto">
                <div className="flex-shrink-0 flex items-center justify-between p-4 bg-surface-elevated border-b border-border-subtle z-10">
                  <span className="font-semibold text-heading">{t('product.filters')}</span>
                  <Button variant="secondary" onClick={() => setShowMobileSidebar(false)} className="p-2 hover:bg-surface-alt rounded">
                    <XMarkIcon className="w-5 h-5" />
                  </Button>
                </div>
                <div className="p-4">
                  <SidebarFilters
                    filters={filtersForSidebar}
                    onFilterChange={handleFiltersChange}
                    activeFilterCount={activeFilterCount}
                    onClearFilters={clearFilters}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Active Filters */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border">
                <span className="text-xs font-medium text-muted uppercase tracking-wide mr-1">{locale === 'en' ? 'Filters' : 'Filtreler'}:</span>
                {currentSearch && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200">
                    {locale === 'en' ? 'Search' : 'Arama'}: &quot;{currentSearch}&quot;
                    <Button variant="secondary" onClick={() => {
                        setFilters({ ...filters, search: '' });
                        setCurrentPage(1);
                        const params = new URLSearchParams(searchParams.toString());
                        params.delete('search');
                        params.delete('page');
                        router.replace(params.toString() ? `/listings?${params.toString()}` : '/listings');
                      }}
                      className="hover:text-primary-900 ml-0.5"
                      aria-label={locale === 'en' ? 'Remove search' : 'Aramayı kaldır'}>
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </Button>
                  </span>
                )}
                {[
                  { k: 'category', v: filtersForSidebar.category }, { k: 'brand', v: filters.brand },
                  { k: 'carModel', v: filters.carModel }, { k: 'scale', v: filters.scale }, { k: 'material', v: filters.material },
                  { k: 'condition', v: filters.condition }, { k: 'manufacturer', v: filters.manufacturer }
                ].map(f => f.v && (
                  <span key={f.k} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200">
                    {f.k === 'condition' ? formatCondition(f.v, locale) :
                     f.k === 'material' ? ({ diecast: 'Diecast (Metal)', resin: 'Resin (Reçine)', composite: 'Composite', plastic: 'Plastic' }[f.v] || f.v) :
                     f.k === 'vehicleType' ? ({ 'araba': 'Arabalar', 'motosiklet': 'Motosikletler', 'motorsports': 'Motorsports', 'ticari': 'Ticari Araçlar', 'insaat': 'İnşaat Araçları', 'tarim': 'Tarım Araçları', 'askeri': 'Askeri Araçlar', 'acil-durum': 'Acil Durum Araçları', 'gemi': 'Gemiler', 'tren': 'Trenler', 'ucak': 'Uçaklar', 'set': 'Setler' }[f.v] || f.v) : f.v}
                    <Button variant="secondary" onClick={() => {
                      const updates: any = { ...filters, [f.k]: '' };
                      if (f.k === 'manufacturer') updates.manufacturerId = '';
                      if (f.k === 'brand') { updates.brandId = ''; updates.carModelId = ''; updates.carModel = ''; }
                      if (f.k === 'category') updates.categoryId = '';
                      if (f.k === 'carModel') { updates.carModelId = ''; }
                      handleFiltersChange(updates);
                    }} className="hover:text-primary-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                ))}
                {(filters.minPrice || filters.maxPrice) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200">
                    ₺{filters.minPrice || '0'} - ₺{filters.maxPrice || '∞'}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, minPrice: '', maxPrice: '' })} className="hover:text-primary-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                {filters.tradeOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-success-50 text-success-700 text-xs font-medium rounded border border-success-200">
                    {t('product.tradeAvailable')}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, tradeOnly: false })} className="hover:text-success-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                {filters.preOrder && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded border border-primary-200">
                    {t('product.preOrder')}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, preOrder: false })} className="hover:text-primary-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                {filters.limited && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-warning-50 text-warning-700 text-xs font-medium rounded border border-warning-200">
                    {t('product.limitedEdition')}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, limited: false })} className="hover:text-warning-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                {filters.set && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-info-50 text-info-700 text-xs font-medium rounded border border-info-200">
                    {t('product.sets')}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, set: false })} className="hover:text-info-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                {filters.discountOnly && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-danger-50 text-danger-700 text-xs font-medium rounded border border-danger-200">
                    {locale === 'en' ? 'On Sale' : 'İndirimli'}
                    <Button variant="secondary" onClick={() => handleFiltersChange({ ...filters, discountOnly: false })} className="hover:text-danger-900 ml-0.5"><XMarkIcon className="w-3.5 h-3.5" /></Button>
                  </span>
                )}
                <Button variant="secondary" onClick={clearFilters} className="text-xs text-primary-600 hover:text-primary-700 font-medium ml-1">{t('product.clearFilters')}</Button>
              </div>
            )}

            {/* Grid Content */}
            {isLoading ? (
              <div className={getGridClass()}>
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse">
                    <div className="aspect-square bg-border-subtle" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-border-subtle rounded w-3/4" />
                      <div className="h-3 bg-border-subtle rounded w-1/2" />
                      <div className="h-4 bg-border-subtle rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center py-20 bg-surface-elevated rounded border border-border">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded mb-4">
                  <MagnifyingGlassIcon className="w-7 h-7 text-subtle" />
                </div>
                <p className="text-muted text-lg font-medium mb-1">{t('product.noListings')}</p>
                <p className="text-subtle text-sm mb-4">{locale === 'en' ? 'Try adjusting your filters' : 'Filtrelerinizi değiştirmeyi deneyin'}</p>
                {activeFilterCount > 0 && (
                  <Button variant="primary" size="md" onClick={clearFilters}>{t('product.clearFilters')}</Button>
                )}
              </div>
            ) : productLayout === 'list' ? (
              <div className="space-y-2">
                {listings.map((listing, index) => (
                  <ProductCard
                    key={listing.id}
                    product={listing}
                    layout="list"
                    index={index}
                    priority={index === 0}
                  />
                ))}
              </div>
            ) : (
              <div className={getGridClass()}>
                {listings.map((listing, index) => (
                  <ProductCard
                    key={listing.id}
                    product={listing}
                    layout="grid"
                    index={index}
                    priority={index < 4}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-elevated rounded border border-border px-4 py-4">
                <div className="text-sm text-muted">
                  {locale === 'en'
                    ? `Showing ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} products`
                    : `${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} / ${pagination.total} ürün gösteriliyor`}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setCurrentPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface font-medium text-body">
                    {locale === 'en' ? 'Previous' : 'Önceki'}
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1;
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.page - 2 + i;
                      }
                      return (
                        <Button variant="secondary" key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium ${
                            pagination.page === pageNum
                              ? 'bg-primary-500 text-inverted'
                              : 'border border-border text-body hover:bg-surface'
                          }`}>
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button variant="secondary" onClick={() => setCurrentPage(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-4 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface font-medium text-body">
                    {locale === 'en' ? 'Next' : 'Sonraki'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
