'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi } from '@/lib/api';

interface Collection {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
  viewCount?: number;
  likeCount?: number;
  userName?: string; // API returns userName directly
  user?: {
    id: string;
    displayName: string;
  };
}

type SortOption = 'popular' | 'recent' | 'name' | 'items_asc' | 'items_desc';

export default function CollectionsPage() {
  const { isAuthenticated, limits } = useAuthStore();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [myCollections, setMyCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadCollections();
  }, [isAuthenticated, sortBy]);

  // Debounced search for public collections
  useEffect(() => {
    if (activeTab === 'public') {
      const timeoutId = setTimeout(() => {
        loadCollections();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, activeTab]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        sortBy,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
      };
      const publicResponse = await collectionsApi.browse(params);
      const publicData = publicResponse.data?.collections || publicResponse.data?.data || [];
      setCollections(Array.isArray(publicData) ? publicData : []);

      if (isAuthenticated) {
        try {
          const myResponse = await collectionsApi.getMyCollections();
          const myData = myResponse.data?.collections || myResponse.data?.data || [];
          setMyCollections(Array.isArray(myData) ? myData : []);
        } catch (e) {
          console.error('My collections load error:', e);
          setMyCollections([]);
        }
      }
    } catch (error) {
      console.error('Collections load error:', error);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering and sorting for my collections
  const filteredAndSortedCollections = useMemo(() => {
    let result = activeTab === 'public' ? collections : myCollections;

    // Client-side search for my collections (public uses backend search)
    if (activeTab === 'mine' && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (collection) =>
          collection.name.toLowerCase().includes(query) ||
          collection.description?.toLowerCase().includes(query) ||
          collection.userName?.toLowerCase().includes(query)
      );
    }

    // Client-side sorting for my collections
    if (activeTab === 'mine') {
      const sorted = [...result];
      switch (sortBy) {
        case 'popular':
          sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
          break;
        case 'recent':
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case 'name':
          // Case-insensitive alphabetical sort (Turkish locale aware)
          const collator = new Intl.Collator('tr', { 
            sensitivity: 'base',
            numeric: false
          });
          sorted.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            return collator.compare(nameA, nameB);
          });
          break;
        case 'items_asc':
          sorted.sort((a, b) => (a.itemCount || 0) - (b.itemCount || 0));
          break;
        case 'items_desc':
          sorted.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
          break;
      }
      return sorted;
    }

    return result;
  }, [activeTab, collections, myCollections, searchQuery, sortBy]);

  const handleSearch = () => {
    if (activeTab === 'public') {
      loadCollections();
    }
    // For my collections, filtering is done client-side via useMemo
  };

  const displayedCollections = filteredAndSortedCollections;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Koleksiyonlar</h1>
            <p className="text-gray-600 mt-1">
              Diecast model araba koleksiyonlarını keşfedin
            </p>
          </div>
          {isAuthenticated && limits?.canCreateCollections && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
            >
              + Yeni Koleksiyon
            </button>
          )}
          {isAuthenticated && !limits?.canCreateCollections && (
            <Link
              href="/pricing"
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg transition-colors"
            >
              Koleksiyon Oluşturmak İçin Üyeliğinizi Yükseltin
            </Link>
          )}
        </div>

        {/* Tabs */}
        {isAuthenticated && (
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => {
                setActiveTab('public');
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'public'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Herkese Açık
            </button>
            <button
              onClick={() => {
                setActiveTab('mine');
                setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                activeTab === 'mine'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              Koleksiyonlarım ({myCollections.length})
            </button>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Koleksiyon ara (isim, açıklama, kullanıcı)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (activeTab === 'public') {
                    loadCollections();
                  }
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
              >
                <FunnelIcon className="w-5 h-5" />
                <span className="hidden sm:inline">Filtreler</span>
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">Sırala:</label>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption);
                  if (activeTab === 'public') {
                    loadCollections();
                  }
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
              >
                <option value="popular">En Popüler</option>
                <option value="recent">En Yeni</option>
                <option value="name">İsme Göre (A-Z)</option>
                <option value="items_desc">Ürün Sayısı (Çok → Az)</option>
                <option value="items_asc">Ürün Sayısı (Az → Çok)</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          {displayedCollections.length > 0 && (
            <p className="text-sm text-gray-600">
              {displayedCollections.length} koleksiyon bulundu
              {searchQuery && ` "${searchQuery}" için`}
            </p>
          )}
        </div>

        {/* Collections Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : displayedCollections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">
              {searchQuery
                ? `"${searchQuery}" için koleksiyon bulunamadı`
                : activeTab === 'mine'
                ? 'Henüz koleksiyonunuz yok'
                : 'Henüz koleksiyon bulunmuyor'}
            </p>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (activeTab === 'public') {
                    loadCollections();
                  }
                }}
                className="mt-4 px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
              >
                Aramayı Temizle
              </button>
            )}
            {activeTab === 'mine' && !searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-6 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
              >
                İlk Koleksiyonunu Oluştur
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.id}`}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="aspect-video bg-gray-100 relative">
                  {collection.coverImageUrl ? (
                    <Image
                      src={collection.coverImageUrl}
                      alt={collection.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-6xl">
                      🚗
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    {collection.isPublic ? (
                      <span className="px-2 py-1 bg-green-500/90 text-white text-xs rounded-full">
                        Herkese Açık
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-500/90 text-white text-xs rounded-full">
                        Özel
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900">{collection.name}</h3>
                  {collection.description && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
                    <span>{collection.itemCount} ürün</span>
                    <span>@{collection.userName || collection.user?.displayName || 'Kullanıcı'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadCollections();
          }}
        />
      )}
    </div>
  );
}

function CreateCollectionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await collectionsApi.create({ name, description, isPublic });
      onCreated();
    } catch (error: any) {
      console.error('Create collection error:', error);
      const errorMessage = error.response?.data?.message || 'Koleksiyon oluşturulamadı';
      alert(errorMessage);
      // If it's a membership restriction error, suggest upgrading
      if (errorMessage.includes('üyeliğiniz') || errorMessage.includes('yetkiniz yok')) {
        setTimeout(() => {
          window.location.href = '/pricing';
        }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Yeni Koleksiyon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1 font-medium">İsim</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Hot Wheels Koleksiyonum"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1 font-medium">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Koleksiyon hakkında..."
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700">
              Herkese açık koleksiyon
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors font-medium"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
