'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { listingsApi, categoriesApi } from '@/lib/api';
import {
  FunnelIcon,
  ArrowsRightLeftIcon,
  HeartIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { getProductEffectivePrice } from '@/lib/productPrice';

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
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  children?: Category[];
}

export default function CategoryPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    condition: '',
    isTradeEnabled: false,
    sortBy: 'created_desc' as 'created_desc' | 'created_asc' | 'price_asc' | 'price_desc' | 'title_asc' | 'title_desc',
  });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const categoryQuery = useQuery({
    queryKey: ['category', slug],
    queryFn: async () => {
      const response = await categoriesApi.findBySlug(slug);
      return response.data;
    },
    enabled: !!slug,
    meta: { page: 'category' },
    retry: false,
  });
  const category = categoryQuery.data ?? null;
  useEffect(() => {
    if (categoryQuery.isError && slug) router.replace('/listings');
  }, [categoryQuery.isError, slug, router]);

  const productsQuery = useQuery({
    queryKey: ['category-products', slug, category?.id, filters, page],
    queryFn: async () => {
      const params: any = {
        categoryId: category!.id,
        page,
        limit: 24,
        sortBy: filters.sortBy,
      };
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
    enabled: !!category?.id,
    meta: { page: 'category-products' },
  });
  const products = productsQuery.data?.products ?? [];
  const totalPages = productsQuery.data?.totalPages ?? 1;
  const totalItems = productsQuery.data?.totalItems ?? 0;
  const loading = productsQuery.isLoading;

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      new: 'Sıfır',
      like_new: 'Sıfır Gibi',
      very_good: 'Çok İyi',
      good: 'İyi',
      fair: 'Orta',
    };
    return labels[condition] || condition;
  };

  if (!category) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <main className="container mx-auto px-4 py-8">
        {/* Category Header */}
        <div className="mb-8">
          <nav className="text-sm text-gray-400 mb-4">
            <Link href="/" className="hover:text-white">Ana Sayfa</Link>
            <span className="mx-2">/</span>
            <Link href="/listings" className="hover:text-white">Ürünler</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{category?.name}</span>
          </nav>

          <h1 className="text-3xl font-bold text-white mb-2">{category?.name}</h1>
          {category?.description && (
            <p className="text-gray-400">{category.description}</p>
          )}
        </div>

        {/* Subcategories */}
        {category?.children && category.children.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">Alt Kategoriler</h2>
            <div className="flex flex-wrap gap-3">
              {category.children.map((child: Category) => (
                <Link
                  key={child.id}
                  href={`/category/${child.slug}`}
                  className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-300 hover:text-white rounded-lg transition-colors"
                >
                  {child.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results Info & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <p className="text-gray-400">
            {totalItems} ürün bulundu
          </p>

          <div className="flex items-center gap-4">
            {/* View Mode */}
            <div className="flex bg-dark-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Squares2X2Icon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <ListBulletIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Sort - API: created_desc | created_asc | price_asc | price_desc | title_asc | title_desc */}
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as typeof filters.sortBy })}
              className="bg-dark-800 border border-dark-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="created_desc">En Yeni</option>
              <option value="created_asc">En Eski</option>
              <option value="price_asc">Fiyat (Düşükten)</option>
              <option value="price_desc">Fiyat (Yüksekten)</option>
              <option value="title_asc">A-Z</option>
              <option value="title_desc">Z-A</option>
            </select>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                showFilters
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-dark-800 border-dark-700 text-gray-300 hover:border-primary-500'
              }`}
            >
              <FunnelIcon className="h-5 w-5" />
              Filtrele
            </button>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Filters Sidebar */}
          {showFilters && (
            <div className="w-72 flex-shrink-0">
              <div className="bg-dark-800 rounded-lg p-6 sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Filtreler</h3>
                  <button
                    onClick={() => setFilters({
                      minPrice: '',
                      maxPrice: '',
                      condition: '',
                      isTradeEnabled: false,
                      sortBy: 'created_desc',
                    })}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    Temizle
                  </button>
                </div>

                {/* Price Range */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Fiyat Aralığı
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
                    Durum
                  </label>
                  <select
                    value={filters.condition}
                    onChange={(e) => setFilters({ ...filters, condition: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="">Tümü</option>
                    <option value="new">Sıfır</option>
                    <option value="like_new">Sıfır Gibi</option>
                    <option value="very_good">Çok İyi</option>
                    <option value="good">İyi</option>
                    <option value="fair">Orta</option>
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
                    <span className="text-gray-300">Sadece takas kabul edenler</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Product Grid/List */}
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16">
                <h2 className="text-xl font-semibold text-white mb-2">Stokta kalmadı</h2>
                <p className="text-gray-400">
                  Bu kategoride şu an stokta ürün bulunmamaktadır.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product: Product) => (
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
                        logContext={{ productId: product.id, page: 'category-grid' }}
                      />
                      {product.isTradeEnabled && (
                        <span className="absolute top-2 left-2 bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                          <ArrowsRightLeftIcon className="h-3 w-3" />
                          Takas
                        </span>
                      )}
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
                          {getConditionLabel(product.condition)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {products.map((product: Product) => (
                  <Link
                    key={product.id}
                    href={`/listings/${product.id}`}
                    className="bg-white rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all flex shadow-sm border border-gray-200"
                  >
                    <div className="w-48 h-48 relative flex-shrink-0 bg-gray-100">
                      <OptimizedImage
                        src={product.images?.[0] || 'https://placehold.co/400x400/1a1a2e/666?text=No+Image'}
                        alt={product.title}
                        fill
                        className="object-cover"
                        fallbackSrc="https://placehold.co/400x400/1a1a2e/666?text=No+Image"
                        logContext={{ productId: product.id, page: 'category-list' }}
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-gray-900 font-medium text-lg">
                            {product.title}
                          </h3>
                          {product.isTradeEnabled && (
                            <span className="bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                              <ArrowsRightLeftIcon className="h-3 w-3" />
                              Takas
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm">
                          Durum: {getConditionLabel(product.condition)}
                        </p>
                        <p className="text-gray-600 text-sm">
                          Satıcı: {product.seller?.displayName || 'Bilinmiyor'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-primary-500 font-bold text-xl">
                          {getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                        </span>
                        <button className="p-2 bg-dark-700 rounded-full hover:bg-dark-600 transition-colors">
                          <HeartIcon className="h-5 w-5 text-white" />
                        </button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-dark-800 text-white rounded-lg disabled:opacity-50"
                >
                  Önceki
                </button>
                <span className="px-4 py-2 text-gray-400">
                  Sayfa {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-dark-800 text-white rounded-lg disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
