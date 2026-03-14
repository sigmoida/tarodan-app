'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import OptimizedImage from '@/components/OptimizedImage';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  FolderPlusIcon,
  EyeIcon,
  HeartIcon,
  XMarkIcon,
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

const PUBLIC_PAGE_SIZE = 24;

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
  const { t, locale } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [activeTab, setActiveTab] = useState<'public' | 'mine'>('public');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    setCategoryId(searchParams.get('categoryId') || '');
  }, [searchParams, mounted]);

  const setCategoryFilter = (id: string) => {
    setCategoryId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('categoryId', id);
    else params.delete('categoryId');
    const q = params.toString();
    router.replace(q ? `?${q}` : '/collections', { scroll: false });
  };

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

  const categoryParamId = typeof categoryId === 'string' ? categoryId.trim() : '';
  // page/pageSize göndermiyoruz; API varsayılanı (ilk sayfa, 20 kayıt) kullanılsın. Gönderince sadece 1 sonuç dönme hatası oluşuyordu.
  const publicQuery = useQuery({
    queryKey: ['collections', 'public', sortBy, searchQuery.trim() || null, categoryParamId || null],
    queryFn: async (): Promise<{ collections: Collection[]; total: number; page: number; pageSize: number }> => {
      const params: Record<string, unknown> = {
        sortBy,
        ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
        ...(categoryParamId ? { categoryId: categoryParamId } : {}),
      };
      const response = await collectionsApi.browse(params);
      const collections = response.data?.collections || response.data?.data || [];
      const total = response.data?.total ?? (Array.isArray(collections) ? collections.length : 0);
      const page = response.data?.page ?? 1;
      const pageSize = response.data?.pageSize ?? PUBLIC_PAGE_SIZE;
      return {
        collections: Array.isArray(collections) ? collections : [],
        total: typeof total === 'number' ? total : 0,
        page: typeof page === 'number' ? page : 1,
        pageSize: typeof pageSize === 'number' ? pageSize : PUBLIC_PAGE_SIZE,
      };
    },
    placeholderData: keepPreviousData,
    meta: { page: 'collections-public' },
  });
  const publicData = publicQuery.data;
  const collections = publicData?.collections ?? [];
  const publicTotal = publicData?.total ?? 0;
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

  const loading = activeTab === 'public'
    ? (publicQuery.isLoading && !publicQuery.data)
    : (myQuery.isLoading && !myQuery.data);

  const canCreateCollection = user?.membershipTier !== 'free' || limits?.canCreateCollections;

  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
  };

  const filteredAndSortedCollections = useMemo(() => {
    let result = activeTab === 'public' ? collections : myCollections;

    if (activeTab === 'mine' && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (collection) =>
          collection.name.toLowerCase().includes(query) ||
          collection.description?.toLowerCase().includes(query) ||
          collection.userName?.toLowerCase().includes(query)
      );
    }

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
          const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: false });
          sorted.sort((a, b) => collator.compare(a.name.toLowerCase(), b.name.toLowerCase()));
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

  const displayedCollections = filteredAndSortedCollections;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-orange-500 rounded-sm" />
                {t('collection.collections')}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{t('footer.description')}</p>
            </div>
            <div className="flex items-center gap-2">
              {mounted && isAuthenticated && limits?.canCreateCollections && (
                <button
                  onClick={handleCreateClick}
                  className="px-4 py-2 bg-orange-500 text-white hover:bg-orange-600 rounded text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  <FolderPlusIcon className="w-4 h-4" />
                  {t('collection.createCollection')}
                </button>
              )}
              {mounted && isAuthenticated && !limits?.canCreateCollections && (
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-sm font-medium transition-colors"
                >
                  {t('membership.upgrade')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
        {/* Tabs */}
        {mounted && isAuthenticated && (
          <div className="flex gap-1 mb-5 bg-gray-100 rounded p-0.5 w-fit">
            <button
              onClick={() => { setActiveTab('public'); setSearchQuery(''); }}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === 'public' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('collection.isPublic')}
            </button>
            <button
              onClick={() => { setActiveTab('mine'); setSearchQuery(''); }}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('collection.myCollections')} ({myCollections.length})
            </button>
          </div>
        )}

        {/* Search & Sort Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('collection.searchCollections')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'public' && (
              <select
                value={categoryId}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none focus:border-orange-400 min-w-[140px]"
              >
                <option value="">{locale === 'en' ? 'All Categories' : 'Tüm Kategoriler'}</option>
                {flatCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-200 rounded bg-white text-sm text-gray-700 focus:outline-none focus:border-orange-400"
            >
              <option value="popular">{t('common.popular')}</option>
              <option value="recent">{t('common.newest')}</option>
              <option value="name">A-Z</option>
              <option value="items_desc">{t('common.desc')}</option>
              <option value="items_asc">{t('common.asc')}</option>
            </select>
          </div>
        </div>

        {/* Results Info */}
        {(displayedCollections.length > 0 || categoryParamId || searchQuery.trim()) && (
          <p className="text-xs text-gray-500 mb-4">
            {activeTab === 'public'
              ? `${publicTotal} ${locale === 'en' ? 'collections' : 'koleksiyon'}`
              : `${displayedCollections.length} ${locale === 'en' ? 'collections' : 'koleksiyon'}`}
            {categoryParamId && flatCategories.find((c) => c.id === categoryParamId) && (
              <> · {flatCategories.find((c) => c.id === categoryParamId)?.name}</>
            )}
            {searchQuery.trim() && ` · "${searchQuery}"`}
          </p>
        )}

        {/* Collections Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-white rounded border border-gray-100 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedCollections.length === 0 ? (
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-50 rounded mb-4">
              <FolderPlusIcon className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-600 text-lg font-medium mb-1">
              {searchQuery ? `"${searchQuery}" ${t('common.noResults')}` : t('collection.noCollections')}
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {locale === 'en' ? 'Start building your collection today' : 'Koleksiyonunuzu bugün oluşturmaya başlayın'}
            </p>
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors">
                {t('common.clear')}
              </button>
            )}
            {activeTab === 'mine' && !searchQuery && (
              <button onClick={() => setShowCreateModal(true)} className="px-5 py-2 bg-orange-500 text-white hover:bg-orange-600 rounded text-sm font-medium transition-colors">
                {t('collection.createCollection')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayedCollections.map((collection, index) => (
              <motion.div
                key={collection.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Link
                  href={`/collections/${collection.id}`}
                  className="block bg-white rounded border border-gray-200 overflow-hidden hover:border-orange-300 hover:shadow-md transition-all group h-full"
                >
                  <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
                    {collection.coverImageUrl ? (
                      <OptimizedImage
                        src={collection.coverImageUrl}
                        alt={collection.name}
                        fill
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        fallbackSrc="https://placehold.co/400x300/f3f4f6/9ca3af?text=Koleksiyon"
                        logContext={{ collectionId: collection.id, page: 'collections' }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 text-4xl">
                        🚗
                      </div>
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      {collection.isPublic ? (
                        <span className="px-1.5 py-0.5 bg-emerald-500/90 text-white text-[10px] font-medium rounded">
                          {t('collection.isPublic')}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-gray-600/90 text-white text-[10px] font-medium rounded">
                          {t('collection.isPrivate')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <h3 className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-orange-600 transition-colors">{collection.name}</h3>
                    {collection.description && (
                      <p className="text-gray-400 text-[10px] mt-0.5 line-clamp-1">{collection.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                      <span className="font-medium">{collection.itemCount} {locale === 'en' ? 'items' : 'ürün'}</span>
                      <div className="flex items-center gap-2">
                        {collection.viewCount !== undefined && (
                          <span className="flex items-center gap-0.5"><EyeIcon className="w-3 h-3" />{collection.viewCount}</span>
                        )}
                        {collection.likeCount !== undefined && (
                          <span className="flex items-center gap-0.5"><HeartIcon className="w-3 h-3" />{collection.likeCount}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1.5 border-t border-gray-100">
                      <span className="text-[10px] text-gray-400">@{collection.userName || collection.user?.displayName || 'Kullanıcı'}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        </div>

      {/* Create Collection Modal */}
      {showCreateModal && (
        <CreateCollectionModal
          flatCategories={flatCategories}
          onClose={() => setShowCreateModal(false)}
          onCreated={(collectionId) => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ['collections', 'mine'] });
            if (collectionId) router.push(`/collections/${collectionId}`);
          }}
        />
      )}

      {/* Premium Required Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded max-w-md w-full p-6 text-center"
          >
            <div className="w-14 h-14 bg-orange-50 rounded flex items-center justify-center mx-auto mb-4">
              <FolderPlusIcon className="w-7 h-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Premium Üyelik Gerekli</h2>
            <p className="text-gray-500 text-sm mb-5">
              Koleksiyon oluşturma özelliği sadece Premium ve üzeri üyelikler için aktiftir.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowPremiumModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded font-medium hover:bg-gray-50 transition-colors text-sm">
                Vazgeç
              </button>
              <Link href="/membership" className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded font-medium hover:bg-orange-600 transition-colors text-center text-sm">
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
  onCreated: (collectionId?: string) => void;
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
      const { data } = await collectionsApi.create({
        name,
        description,
        isPublic,
        ...(categoryId ? { categoryId } : {}),
      });
      const createdId = data?.id;
      onCreated(createdId);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Create collection error:', error);
      const errorMessage = error.response?.data?.message || 'Koleksiyon oluşturulamadı';
      alert(errorMessage);
      if (errorMessage.includes('üyeliğiniz') || errorMessage.includes('yetkiniz yok')) {
        setTimeout(() => { window.location.href = '/pricing'; }, 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4 text-gray-900">Yeni Koleksiyon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">İsim</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400"
              placeholder="Hot Wheels Koleksiyonum"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Açıklama</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400"
              placeholder="Koleksiyon hakkında..."
              rows={3}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Kategori</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:border-orange-400"
            >
              <option value="">Kategori seçin (isteğe bağlı)</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700">Herkese açık koleksiyon</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !name}
              className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
