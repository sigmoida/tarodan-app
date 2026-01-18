'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { listingsApi, categoriesApi } from '@/lib/api';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  HeartIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';

interface Product {
  id: string;
  title: string;
  price: number;
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
  const query = searchParams.get('q') || '';
  
  const [searchTerm, setSearchTerm] = useState(query);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setSearchTerm(query);
    loadProducts();
  }, [query, filters, page]);

  const loadCategories = async () => {
    try {
      const response = await categoriesApi.findAll();
      setCategories(response.data.data || response.data || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
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
      setProducts(data.data || data.products || []);
      setTotalPages(data.meta?.totalPages || 1);
      setTotalItems(data.meta?.total || 0);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchTerm) params.set('q', searchTerm);
    if (filters.categoryId) params.set('category', filters.categoryId);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.condition) params.set('condition', filters.condition);
    if (filters.isTradeEnabled) params.set('trade', 'true');
    if (filters.sortBy !== 'createdAt') params.set('sort', filters.sortBy);
    if (filters.sortOrder !== 'desc') params.set('order', filters.sortOrder);
    
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
      new: 'Sıfır',
      like_new: 'Sıfır Gibi',
      very_good: 'Çok İyi',
      good: 'İyi',
      fair: 'Orta',
    };
    return labels[condition] || condition;
  };

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

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
                placeholder="Ürün, marka veya kategori ara..."
                className="w-full bg-dark-800 border border-dark-700 rounded-full pl-12 pr-32 py-4 text-white focus:outline-none focus:border-primary-500 text-lg"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-full transition-colors"
              >
                Ara
              </button>
            </div>
          </form>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {query && (
              <h1 className="text-2xl font-bold text-white">
                "{query}" için arama sonuçları
              </h1>
            )}
            <p className="text-gray-400 mt-1">
              {totalItems} ürün bulundu
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
              <option value="createdAt-desc">En Yeni</option>
              <option value="createdAt-asc">En Eski</option>
              <option value="price-asc">Fiyat (Düşükten)</option>
              <option value="price-desc">Fiyat (Yüksekten)</option>
              <option value="title-asc">A-Z</option>
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
                    onClick={clearFilters}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    Temizle
                  </button>
                </div>

                {/* Category Filter */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Kategori
                  </label>
                  <select
                    value={filters.categoryId}
                    onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                    className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-2 text-white"
                  >
                    <option value="">Tümü</option>
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

                {/* Apply Button */}
                <button
                  onClick={handleSearch}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-lg transition-colors"
                >
                  Filtreleri Uygula
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
                <h2 className="text-xl font-semibold text-white mb-2">Sonuç bulunamadı</h2>
                <p className="text-gray-400">
                  Arama kriterlerinize uygun ürün bulunamadı. Farklı anahtar kelimeler deneyin.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {products.map((product) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className="bg-dark-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all group"
                    >
                      <div className="aspect-square relative">
                        <Image
                          src={product.images?.[0] || 'https://placehold.co/400x400/1a1a2e/666?text=No+Image'}
                          alt={product.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                        {product.isTradeEnabled && (
                          <span className="absolute top-2 left-2 bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                            <ArrowsRightLeftIcon className="h-3 w-3" />
                            Takas
                          </span>
                        )}
                        <button className="absolute top-2 right-2 p-2 bg-dark-900/70 rounded-full hover:bg-dark-900 transition-colors">
                          <HeartIcon className="h-5 w-5 text-white" />
                        </button>
                      </div>
                      <div className="p-4">
                        <h3 className="text-white font-medium line-clamp-2 mb-2">
                          {product.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <span className="text-primary-400 font-bold text-lg">
                            ₺{product.price?.toLocaleString()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {getConditionLabel(product.condition)}
                          </span>
                        </div>
                        {product.category && (
                          <p className="text-gray-500 text-sm mt-2">
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
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
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
