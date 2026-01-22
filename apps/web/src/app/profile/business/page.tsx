'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeftIcon, EyeIcon, HeartIcon, ShoppingBagIcon, CubeIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface ProductStats {
  id: string;
  title: string;
  viewCount: number;
  likeCount: number;
  price: number;
  image?: string;
}

interface CollectionStats {
  id: string;
  name: string;
  viewCount: number;
  likeCount: number;
  coverImage?: string;
  itemCount: number;
}

interface BusinessStats {
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    totalRevenue: number;
    totalCollections: number;
    collectionViews: number;
    collectionLikes: number;
  };
  weekly: {
    views: number;
    likes: number;
  };
  topProducts: {
    byViews: ProductStats[];
    byLikes: ProductStats[];
  };
  topCollections: CollectionStats[];
  company: {
    name: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
}

export default function BusinessDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'collections'>('overview');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadBusinessStats();
  }, [isAuthenticated]);

  const loadBusinessStats = async () => {
    try {
      const response = await api.get('/users/me/business-stats');
      setStats(response.data);
    } catch (err: any) {
      if (err.response?.status === 400) {
        const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Bu özellik sadece İşletme hesapları için geçerlidir.';
        setError(errorMessage);
      } else {
        setError('İstatistikler yüklenirken bir hata oluştu');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Profile Dön
          </Link>
          
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-8 text-center">
            <p className="text-red-400 text-lg mb-4">{error}</p>
            {error.includes('şirket adı') || error.includes('companyName') || error.includes('Şirket adı') ? (
              <Link
                href="/profile/edit"
                className="inline-block px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                Şirket Adı Ekle
              </Link>
            ) : (
              <Link
                href="/pricing"
                className="inline-block px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all"
              >
                Üyeliğimi Yükselt
              </Link>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Profile Dön
        </Link>

        {/* Header */}
        <div className="bg-gradient-to-br from-orange-900/40 to-amber-900/40 border border-orange-500/30 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center text-3xl">
              {stats?.company.avatarUrl ? (
                <img
                  src={stats.company.avatarUrl}
                  alt={stats.company.name || stats.company.displayName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                '🏢'
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                📊 İşletme Paneli
                {stats?.company.isVerified && (
                  <span className="text-green-400 text-base">✓</span>
                )}
              </h1>
              <p className="text-orange-300 text-lg mt-1">
                {stats?.company.name || stats?.company.displayName}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-700">
          {[
            { id: 'overview', label: 'Genel Bakış', icon: '📈' },
            { id: 'products', label: 'Ürünler', icon: '📦' },
            { id: 'collections', label: 'Koleksiyonlar', icon: '📚' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-orange-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-8">
            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                icon={<EyeIcon className="w-6 h-6" />}
                label="Toplam Görüntülenme"
                value={stats.overview.totalViews}
                color="blue"
              />
              <StatCard
                icon={<HeartIcon className="w-6 h-6" />}
                label="Toplam Beğeni"
                value={stats.overview.totalLikes}
                color="red"
              />
              <StatCard
                icon={<ShoppingBagIcon className="w-6 h-6" />}
                label="Toplam Satış"
                value={stats.overview.totalSales}
                color="green"
              />
              <StatCard
                icon={<CubeIcon className="w-6 h-6" />}
                label="Aktif Ürün"
                value={stats.overview.activeProducts}
                color="purple"
              />
              <StatCard
                icon={<RectangleStackIcon className="w-6 h-6" />}
                label="Koleksiyon"
                value={stats.overview.totalCollections}
                color="orange"
              />
            </div>

            {/* Revenue Card */}
            <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Toplam Gelir</h3>
              <p className="text-4xl font-bold text-white">
                ₺{stats.overview.totalRevenue.toLocaleString('tr-TR')}
              </p>
            </div>

            {/* Weekly Stats */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-4">Bu Hafta</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-400 mb-2">
                    <EyeIcon className="w-5 h-5" />
                    <span>Görüntülenme</span>
                  </div>
                  <p className="text-3xl font-bold">{stats.weekly.views.toLocaleString()}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <HeartIcon className="w-5 h-5" />
                    <span>Beğeni</span>
                  </div>
                  <p className="text-3xl font-bold">{stats.weekly.likes.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Collection Stats */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-4">Koleksiyon İstatistikleri</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Toplam Görüntülenme</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.overview.collectionViews.toLocaleString()}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400">Toplam Beğeni</p>
                  <p className="text-2xl font-bold text-red-400">{stats.overview.collectionLikes.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && stats && (
          <div className="space-y-8">
            {/* Top Products by Views */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <EyeIcon className="w-6 h-6 text-blue-400" />
                En Çok Görüntülenen Ürünler
              </h3>
              <div className="space-y-3">
                {stats.topProducts.byViews.length > 0 ? (
                  stats.topProducts.byViews.map((product, index) => (
                    <ProductRow key={product.id} product={product} index={index} metric="views" />
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-4">Henüz ürün istatistiği yok</p>
                )}
              </div>
            </div>

            {/* Top Products by Likes */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <HeartIcon className="w-6 h-6 text-red-400" />
                En Çok Beğenilen Ürünler
              </h3>
              <div className="space-y-3">
                {stats.topProducts.byLikes.length > 0 ? (
                  stats.topProducts.byLikes.map((product, index) => (
                    <ProductRow key={product.id} product={product} index={index} metric="likes" />
                  ))
                ) : (
                  <p className="text-gray-400 text-center py-4">Henüz ürün istatistiği yok</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Collections Tab */}
        {activeTab === 'collections' && stats && (
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <RectangleStackIcon className="w-6 h-6 text-orange-400" />
              En Popüler Koleksiyonlar
            </h3>
            <div className="space-y-3">
              {stats.topCollections.length > 0 ? (
                stats.topCollections.map((collection, index) => (
                  <CollectionRow key={collection.id} collection={collection} index={index} />
                ))
              ) : (
                <p className="text-gray-400 text-center py-4">Henüz koleksiyon istatistiği yok</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  color: 'blue' | 'red' | 'green' | 'purple' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  return (
    <div className={`rounded-xl p-4 border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2 opacity-80">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

// Product Row Component
function ProductRow({ 
  product, 
  index, 
  metric 
}: { 
  product: ProductStats; 
  index: number; 
  metric: 'views' | 'likes';
}) {
  return (
    <Link
      href={`/listings/${product.id}`}
      className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
    >
      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-bold">
        {index + 1}
      </div>
      <div className="w-16 h-16 bg-gray-600 rounded-lg overflow-hidden flex-shrink-0">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{product.title}</p>
        <p className="text-sm text-orange-400">₺{product.price.toLocaleString('tr-TR')}</p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className={`flex items-center gap-1 ${metric === 'views' ? 'text-blue-400' : 'text-gray-400'}`}>
          <EyeIcon className="w-4 h-4" />
          <span>{product.viewCount.toLocaleString()}</span>
        </div>
        <div className={`flex items-center gap-1 ${metric === 'likes' ? 'text-red-400' : 'text-gray-400'}`}>
          <HeartIcon className="w-4 h-4" />
          <span>{product.likeCount.toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}

// Collection Row Component
function CollectionRow({ 
  collection, 
  index 
}: { 
  collection: CollectionStats; 
  index: number;
}) {
  return (
    <Link
      href={`/collections/${collection.id}`}
      className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
    >
      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-bold">
        {index + 1}
      </div>
      <div className="w-16 h-16 bg-gray-600 rounded-lg overflow-hidden flex-shrink-0">
        {collection.coverImage ? (
          <img
            src={collection.coverImage}
            alt={collection.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl">📚</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{collection.name}</p>
        <p className="text-sm text-gray-400">{collection.itemCount} ürün</p>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1 text-blue-400">
          <EyeIcon className="w-4 h-4" />
          <span>{collection.viewCount.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1 text-red-400">
          <HeartIcon className="w-4 h-4" />
          <span>{collection.likeCount.toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}
