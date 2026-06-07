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
  StarIcon,
  TagIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { listingsApi, categoriesApi } from '@/lib/api';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
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
  const { t, locale } = useTranslation();

  const KNOWN_BRANDS = [
    'Porsche', 'Ferrari', 'BMW', 'Mercedes', 'Audi', 'Lamborghini',
    'McLaren', 'Bugatti', 'Koenigsegg', 'Pagani',
  ];

  const urlSearch = searchParams.get('search') || '';
  const autoDetectedBrand = urlSearch
    ? KNOWN_BRANDS.find(b => b.toLowerCase() === urlSearch.toLowerCase()) || ''
    : '';
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid-6');
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 48;

  // Manufacturer-scoped custom attributes are URL-encoded as `attr.<groupSlug>=<a,b,c>`.
  // Example: ?attr.hw-rarity=treasure-hunt&attr.hw-segment=mainline,premium
  const parseCustomAttrsFromUrl = (): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    searchParams.forEach((value, key) => {
      if (!key.startsWith('attr.') || !value) return;
      const groupSlug = key.slice('attr.'.length);
      if (!groupSlug) return;
      out[groupSlug] = value.split(',').filter(Boolean);
    });
    return out;
  };

  const [filters, setFilters] = useState({
    search: autoDetectedBrand ? '' : urlSearch,
    brand: searchParams.get('brand') || autoDetectedBrand || '',
    brandId: searchParams.get('brandId') || '',
    carModelId: searchParams.get('carModelId') || '',
    carModel: searchParams.get('carModel') || '',
    scale: searchParams.get('scale') || '',
    material: searchParams.get('material') || '',
    condition: searchParams.get('condition') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    tradeOnly: searchParams.get('tradeOnly') === 'true',
    discountOnly: searchParams.get('discountOnly') === 'true',
    preOrder: searchParams.get('preOrder') === 'true',
    limited: searchParams.get('limited') === 'true',
    set: searchParams.get('set') === 'true',
    sortBy: searchParams.get('sortBy') || 'relevance',
    category: searchParams.get('category') || '',
    categoryId: searchParams.get('categoryId') || '',
    manufacturer: searchParams.get('manufacturer') || '',
    manufacturerId: searchParams.get('manufacturerId') || '',
    customAttributes: parseCustomAttrsFromUrl(),
  });

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
    const detectedBrand = newSearch
      ? KNOWN_BRANDS.find(b => b.toLowerCase() === newSearch.toLowerCase()) || ''
      : '';
    const pageParam = searchParams.get('page');
    const page = pageParam ? parseInt(pageParam, 10) : 1;
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
    queryKey: ['categoryBySlug', categorySlug],
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
    queryKey: ['listings', filters, resolvedCategoryId ?? '', currentPage],
    queryFn: async () => {
      const urlCategoryId = resolvedCategoryId;
      const conditionMap: Record<string, string> = {
        'Yeni': 'new', 'Mükemmel': 'very_good', 'İyi': 'good', 'Orta': 'fair',
      };
      const mappedCondition = filters.condition ? conditionMap[filters.condition] || filters.condition : undefined;

      const buildListParams = (): Record<string, any> => {
        const p: Record<string, any> = { limit: pageLimit, page: currentPage };
        if (filters.search) p.search = filters.search;
        if (urlCategoryId) p.categoryId = urlCategoryId;
        if (mappedCondition) p.condition = mappedCondition;
        if (filters.minPrice) p.minPrice = Number(filters.minPrice);
        if (filters.maxPrice) p.maxPrice = Number(filters.maxPrice);
        if (filters.brandId) p.brandId = filters.brandId;
        else if (filters.brand) p.brand = filters.brand;
        if (filters.carModelId) p.carModelId = filters.carModelId;
        if (filters.scale) p.scale = filters.scale;
        if (filters.material) p.material = filters.material;
        if (filters.manufacturerId) p.manufacturerId = filters.manufacturerId;
        else if (filters.manufacturer) p.manufacturer = filters.manufacturer;
        if (filters.tradeOnly) p.tradeOnly = true;
        if (filters.discountOnly) p.discountOnly = true;
        if (filters.preOrder) p.preOrder = true;
        if (filters.limited) p.limited = true;
        if (filters.set) p.set = true;
        // 'relevance' is the server-side default ranking (relevanceScore); don't send it as an explicit sort.
        if (filters.sortBy && filters.sortBy !== 'relevance') p.sortBy = filters.sortBy;
        // Manufacturer-scoped attribute selections, sent group-aware so backend can apply
        // OR-within-group + AND-across-groups semantics. Empty groups are dropped.
        if (filters.customAttributes) {
          const nonEmpty = Object.fromEntries(
            Object.entries(filters.customAttributes).filter(
              ([, slugs]) => Array.isArray(slugs) && slugs.length > 0,
            ),
          );
          if (Object.keys(nonEmpty).length > 0) {
            p.attrGroups = JSON.stringify(nonEmpty);
          }
        }
        return p;
      };

      const params = buildListParams();
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
            <div className="sticky top-[80px] max-h-[calc(100vh-80px)] overflow-y-auto bg-surface-elevated rounded border border-border">
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
              /* LIST VIEW */
              <div className="space-y-2">
                {listings.map((listing, index) => (
                  <motion.div key={listing.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}>
                    <Link href={`/listings/${listing.id}`}>
                      <div className="bg-surface-elevated rounded border border-border hover:border-primary-300 hover:shadow-sm transition-all flex gap-4 p-3">
                        <div className="relative w-20 h-20 flex-shrink-0 bg-surface-alt rounded overflow-hidden">
                          <OptimizedImage
                            src={getImageUrl(listing.images?.[0], index, listing.title)}
                            alt={listing.title}
                            fill
                            className="object-cover"
                            fallbackSrc={LISTING_PLACEHOLDERS[index % LISTING_PLACEHOLDERS.length]}
                            logContext={{ listingId: listing.id, page: 'listings' }}
                            priority={index === 0}
                          />
                          {(listing.trade_available || listing.isTradeEnabled) && (
                            <div className="absolute top-1 right-1 bg-success-500 text-inverted p-0.5 rounded">
                              <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 flex items-center justify-between min-w-0">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-heading line-clamp-1 text-sm">{listing.title}</h3>
                            <p className="text-xs text-muted mt-0.5">
                              {typeof listing.brand === 'object' ? listing.brand.name : listing.brand}{listing.scale ? ` · ${listing.scale}` : ''}{listing.year ? ` · ${listing.year}` : ''}
                            </p>
                            <span className="text-[10px] text-subtle bg-surface-alt px-1.5 py-0.5 rounded inline-block mt-1">{formatCondition(listing.condition, locale)}</span>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                              <div className="flex items-center gap-1">
                                <StarIconSolid className="w-3.5 h-3.5 text-warning-400" />
                                <span className="text-xs font-semibold text-heading">{listing.rating.average.toFixed(1)}</span>
                                <span className="text-[11px] text-subtle">({listing.rating.count})</span>
                              </div>
                            )}
                            {isProductOnSaleDisplay(listing) && (
                              <span className="text-xs text-danger-500 font-semibold bg-danger-50 px-1.5 py-0.5 rounded">%{listing.discountPercent ?? 0}</span>
                            )}
                            <p className="text-base font-bold text-primary-600 whitespace-nowrap">{getProductEffectivePrice(listing).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              /* GRID VIEW */
              <div className={getGridClass()}>
                {listings.map((listing, index) => (
                  <motion.div key={listing.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }}>
                    <Link href={`/listings/${listing.id}`}>
                      <div className="bg-surface-elevated rounded border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all group h-full flex flex-col">
                        <div className="relative aspect-square bg-surface-alt">
                          <OptimizedImage
                            src={getImageUrl(listing.images?.[0], index, listing.title)}
                            alt={listing.title}
                            fill
                            className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                            fallbackSrc={LISTING_PLACEHOLDERS[index % LISTING_PLACEHOLDERS.length]}
                            logContext={{ listingId: listing.id, page: 'listings' }}
                            priority={index < 4}
                          />
                          <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
                            {listing.isBoosted && (
                              <div className="bg-amber-500 text-inverted text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {locale === 'en' ? 'Sponsored' : 'Sponsorlu'}
                              </div>
                            )}
                            {(listing.trade_available || listing.isTradeEnabled) && (
                              <div className="bg-success-500 text-inverted text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                                <span className="hidden sm:inline">{locale === 'en' ? 'Trade' : 'Takas'}</span>
                              </div>
                            )}
                          </div>
                          {isProductOnSaleDisplay(listing) && (
                            <div className="absolute top-1.5 right-1.5 bg-danger-500 text-inverted text-[10px] font-bold px-1.5 py-0.5 rounded">
                              %{listing.discountPercent ?? 0}
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 flex-1 flex flex-col">
                          <h3 className="font-medium text-heading line-clamp-2 text-xs leading-tight mb-1 group-hover:text-primary-600 transition-colors">{listing.title}</h3>
                          <p className="text-[10px] text-subtle mb-1.5">
                            {typeof listing.brand === 'object' ? listing.brand.name : listing.brand}{listing.scale ? ` · ${listing.scale}` : ''}{listing.year ? ` · ${listing.year}` : ''}
                          </p>
                          {listing.rating && listing.rating.average !== null && listing.rating.count > 0 && (
                            <div className="flex items-center gap-0.5 mb-1.5">
                              <StarIconSolid className="w-3 h-3 text-warning-400" />
                              <span className="text-[10px] font-semibold text-heading">{listing.rating.average.toFixed(1)}</span>
                              <span className="text-[10px] text-subtle">({listing.rating.count})</span>
                            </div>
                          )}
                          <div className="mt-auto pt-1.5 border-t border-border-subtle">
                            <span className="text-[9px] text-subtle bg-surface px-1 py-0.5 rounded inline-block mb-1">{formatCondition(listing.condition, locale)}</span>
                            {isProductOnSaleDisplay(listing) && (
                              <span className="text-[10px] text-subtle line-through ml-1.5">{getProductOriginalPriceForDisplay(listing).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺</span>
                            )}
                            <p className="text-sm font-bold text-primary-600">{getProductEffectivePrice(listing).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₺</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
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
