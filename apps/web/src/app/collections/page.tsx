'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import OptimizedImage from '@/components/OptimizedImage';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  BarsArrowUpIcon,
  BarsArrowDownIcon,
  FolderPlusIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi, categoriesApi } from '@/lib/api';
import { useTranslation } from '@/i18n';

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
  userName?: string;
  categoryId?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  user?: {
    id: string;
    displayName: string;
  };
}

type SortOption = 'popular' | 'recent' | 'name' | 'items_asc' | 'items_desc';

// Flatten category tree for dropdown (root + children with indent)
function flattenCategories(tree: { id: string; name: string; slug: string; children?: any[] }[], prefix = ''): { id: string; name: string; slug: string }[] {
  const out: { id: string; name: string; slug: string }[] = [];
  for (const c of tree) {
    out.push({ id: c.id, name: prefix ? `${prefix} ${c.name}` : c.name, slug: c.slug });
    if (c.children?.length) {
      out.push(...flattenCategories(c.children, '—'));
    }
  }
  return out;
}

export default function CollectionsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [showFilters, setShowFilters] = useState(false);
  const [categorySlug, setCategorySlug] = useState(searchParams.get('category') || '');

  useEffect(() => {
    setCategorySlug(searchParams.get('category') || '');
  }, [searchParams]);

  const setCategoryFilter = (slug: string) => {
    setCategorySlug(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('category', slug);
    else params.delete('category');
    const q = params.toString();
    router.replace(q ? `?${q}` : '/collections', { scroll: false });
  };

  // Categories for filter dropdown (refresh=1 so API cache is cleared and we get simplified 8 categories)
  const { data: categoriesTree } = useQuery({
    queryKey: ['categories', 'collections'],
    queryFn: async () => {
      const res = await categoriesApi.findAll({ refresh: '1' });
      return res.data?.data ?? res.data ?? [];
    },
    meta: { page: 'collections-categories' },
  });
  const flatCategories = useMemo(
    () => (Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : []),
    [categoriesTree],
  );

  // Public collections: React Query (cache + refetch on sort/search/category)
  const categoryParam = typeof categorySlug === 'string' ? categorySlug.trim() : '';
  const publicQuery = useQuery({
    queryKey: ['collections', 'public', sortBy, searchQuery.trim() || null, categoryParam || null],
    queryFn: async (): Promise<Collection[]> => {
      const params: Record<string, unknown> = {
        sortBy,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        ...(categoryParam ? { category: categoryParam } : {}),
      };
      const response = await collectionsApi.browse(params);
      const data = response.data?.collections || response.data?.data || [];
      return Array.isArray(data) ? data : [];
    },
    meta: { page: 'collections-public' },
  });
  const collections = publicQuery.data ?? [];

  // My collections: React Query (only when authenticated)
  const myQuery = useQuery({
    queryKey: ['collections', 'mine'],
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getMyCollections();
      const data = response.data?.collections || response.data?.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    meta: { page: 'collections-mine' },
  });
  const myCollections = myQuery.data ?? [];

  const loading = activeTab === 'public' ? publicQuery.isLoading : myQuery.isLoading;

  const canCreateCollection = user?.membershipTier !== 'free' || limits?.canCreateCollections;

  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
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
    // Public: useQuery refetches when searchQuery/sortBy (queryKey) change. Mine: client-side filter via useMemo.
  };

  const displayedCollections = filteredAndSortedCollections;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('collection.collections')}</h1>
            <p className="text-gray-600 mt-1">
              {t('footer.description')}
            </p>
          </div>
          {isAuthenticated && limits?.canCreateCollections && (
            <button
              onClick={handleCreateClick}
              className="px-4 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
            >
              + {t('collection.createCollection')}
            </button>
          )}
          {isAuthenticated && !limits?.canCreateCollections && (
            <Link
              href="/pricing"
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg transition-colors"
            >
              {t('membership.upgrade')}
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
              {t('collection.isPublic')}
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
              {t('collection.myCollections')} ({myCollections.length})
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
              placeholder={t('collection.searchCollections')}
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
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort and Filter Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
              >
                <FunnelIcon className="w-5 h-5" />
                <span className="hidden sm:inline">{t('product.filters')}</span>
              </button>
              {activeTab === 'public' && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 font-medium">{t('common.category')}:</label>
                  <select
                    value={categorySlug}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white min-w-[160px]"
                  >
                    <option value="">{t('common.all')}</option>
                    {flatCategories.map((cat) => (
                      <option key={cat.id} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium">{t('common.sort')}:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 bg-white"
              >
                <option value="popular">{t('common.popular')}</option>
                <option value="recent">{t('common.newest')}</option>
                <option value="name">A-Z</option>
                <option value="items_desc">{t('common.desc')}</option>
                <option value="items_asc">{t('common.asc')}</option>
              </select>
            </div>
          </div>

          {/* Results Count */}
          {(displayedCollections.length > 0 || categoryParam || searchQuery.trim()) && (
            <p className="text-sm text-gray-600">
              {displayedCollections.length} koleksiyon bulundu
              {categoryParam && flatCategories.find((c) => c.slug === categoryParam) && (
                <> · Kategori: {flatCategories.find((c) => c.slug === categoryParam)?.name}</>
              )}
              {searchQuery.trim() && ` · "${searchQuery}"`}
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
                ? `"${searchQuery}" ${t('common.noResults')}`
                : activeTab === 'mine'
                ? t('collection.noCollections')
                : t('collection.noCollections')}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
              >
                {t('common.clear')}
              </button>
            )}
            {activeTab === 'mine' && !searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-6 py-2 bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
              >
                {t('collection.createCollection')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {displayedCollections.map((collection) => (
              <Link
                key={collection.id}
                href={`/collections/${collection.id}`}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary-500 transition-all"
              >
                <div className="aspect-video bg-gray-100 relative">
                  {collection.coverImageUrl ? (
                    <OptimizedImage
                      src={collection.coverImageUrl}
                      alt={collection.name}
                      fill
                      className="object-cover"
                      fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Koleksiyon"
                      logContext={{ collectionId: collection.id, page: 'collections' }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-6xl">
                      🚗
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    {collection.isPublic ? (
                      <span className="px-2 py-1 bg-green-500/90 text-white text-xs rounded-full">
                        {t('collection.isPublic')}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-500/90 text-white text-xs rounded-full">
                        {t('collection.isPrivate')}
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
          flatCategories={flatCategories}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['collections', 'mine'] });
          }}
        />
      )}

      {/* Premium Required Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl max-w-md w-full p-6 text-center"
          >
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderPlusIcon className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Premium Üyelik Gerekli
            </h2>
            <p className="text-gray-600 mb-6">
              Koleksiyon oluşturma özelliği sadece Premium ve üzeri üyelikler için aktiftir. 
              Üyeliğinizi yükselterek kendi koleksiyonlarınızı oluşturabilir ve paylaşabilirsiniz.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowPremiumModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                Vazgeç
              </button>
              <Link
                href="/membership"
                className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors text-center"
              >
                Üyeliği Yükselt
              </Link>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function CreateCollectionModal({
  onClose,
  onCreated,
  flatCategories,
}: {
  onClose: () => void;
  onCreated: () => void;
  flatCategories: { id: string; name: string; slug: string }[];
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await collectionsApi.create({
        name,
        description,
        isPublic,
        ...(categoryId ? { categoryId } : {}),
      });
      onCreated();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Create collection error:', error);
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
          <div>
            <label className="block text-sm text-gray-700 mb-1 font-medium">Kategori</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Kategori seçin (isteğe bağlı)</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
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
