'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { listingsApi, categoriesApi } from '@/lib/api';
import {
  FunnelIcon,
  ArrowsRightLeftIcon,
  HeartIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';

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

  const [category, setCategory] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    condition: '',
    isTradeEnabled: false,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (slug) {
      loadCategory();
    }
  }, [slug]);

  useEffect(() => {
    if (category) {
      loadProducts();
    }
  }, [category, filters, page]);

  const loadCategory = async () => {
    try {
      const response = await categoriesApi.findBySlug(slug);
      setCategory(response.data);
    } catch (error) {
      console.error('Failed to load category:', error);
      // Redirect to listings if category not found
      router.push('/listings');
    }
  };

  const loadProducts = async () => {
    if (!category) return;

    try {
      setLoading(true);
      const params: any = {
        categoryId: category.id,
        page,
        limit: 24,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      };

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
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
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

  if (!category && !loading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

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
              {category.children.map((child) => (
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
                    onClick={() => setFilters({
                      minPrice: '',
                      maxPrice: '',
                      condition: '',
                      isTradeEnabled: false,
                      sortBy: 'createdAt',
                      sortOrder: 'desc',
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
                <h2 className="text-xl font-semibold text-white mb-2">Ürün bulunamadı</h2>
                <p className="text-gray-400">
                  Bu kategoride henüz ürün bulunmamaktadır.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
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
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/listings/${product.id}`}
                    className="bg-dark-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all flex"
                  >
                    <div className="w-48 h-48 relative flex-shrink-0">
                      <Image
                        src={product.images?.[0] || 'https://placehold.co/400x400/1a1a2e/666?text=No+Image'}
                        alt={product.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-white font-medium text-lg">
                            {product.title}
                          </h3>
                          {product.isTradeEnabled && (
                            <span className="bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                              <ArrowsRightLeftIcon className="h-3 w-3" />
                              Takas
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400 text-sm">
                          Durum: {getConditionLabel(product.condition)}
                        </p>
                        <p className="text-gray-500 text-sm">
                          Satıcı: {product.seller?.displayName || 'Bilinmiyor'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-primary-400 font-bold text-xl">
                          ₺{product.price?.toLocaleString()}
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

      <Footer />
    </div>
  );
}
