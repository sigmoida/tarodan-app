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
import { Button, Checkbox, Input, Select, Textarea } from '@tarodan/ui';

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
    <div className="min-h-screen bg-surface">
      {/* Page Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                <div className="w-1 h-6 bg-primary-500 rounded-sm" />
                {t('collection.collections')}
              </h1>
              <p className="text-sm text-muted mt-0.5">{t('footer.description')}</p>
            </div>
            <div className="flex items-center gap-2">
              {mounted && isAuthenticated && limits?.canCreateCollections && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCreateClick}
                  className="flex items-center gap-1.5"
                >
                  <FolderPlusIcon className="w-4 h-4" />
                  {t('collection.createCollection')}
                </Button>
              )}
              {mounted && isAuthenticated && !limits?.canCreateCollections && (
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-surface-alt text-body hover:bg-border-subtle rounded text-sm font-medium transition-colors"
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
          <div className="flex gap-1 mb-5 bg-surface-alt rounded p-0.5 w-fit">
            <Button variant="secondary" onClick={() => { setActiveTab('public'); setSearchQuery(''); }}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === 'public' ? 'bg-surface-elevated text-heading shadow-sm' : 'text-muted hover:text-body'
              }`}>
              {t('collection.isPublic')}
            </Button>
            <Button variant="secondary" onClick={() => { setActiveTab('mine'); setSearchQuery(''); }}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === 'mine' ? 'bg-surface-elevated text-heading shadow-sm' : 'text-muted hover:text-body'
              }`}>
              {t('collection.myCollections')} ({myCollections.length})
            </Button>
          </div>
        )}

        {/* Search & Sort Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
            <Input type="text"
              placeholder={t('collection.searchCollections')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-border rounded bg-surface-elevated text-sm text-heading placeholder-subtle focus:outline-none focus:border-primary-400" />
            {searchQuery && (
              <Button variant="secondary" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-muted">
                <XMarkIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'public' && (
              <Select
                value={categoryId}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-auto min-w-[140px]"
                selectSize="sm"
              >
                <option value="">{locale === 'en' ? 'All Categories' : 'Tüm Kategoriler'}</option>
                {flatCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
            )}
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-auto"
              selectSize="sm"
            >
              <option value="popular">{t('common.popular')}</option>
              <option value="recent">{t('common.newest')}</option>
              <option value="name">A-Z</option>
              <option value="items_desc">{t('common.desc')}</option>
              <option value="items_asc">{t('common.asc')}</option>
            </Select>
          </div>
        </div>

        {/* Results Info */}
        {(displayedCollections.length > 0 || categoryParamId || searchQuery.trim()) && (
          <p className="text-xs text-muted mb-4">
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
              <div key={i} className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-border-subtle" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-border-subtle rounded w-3/4" />
                  <div className="h-3 bg-border-subtle rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedCollections.length === 0 ? (
          <div className="text-center py-20 bg-surface-elevated rounded border border-border">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded mb-4">
              <FolderPlusIcon className="w-7 h-7 text-subtle" />
            </div>
            <p className="text-muted text-lg font-medium mb-1">
              {searchQuery ? `"${searchQuery}" ${t('common.noResults')}` : t('collection.noCollections')}
            </p>
            <p className="text-subtle text-sm mb-4">
              {locale === 'en' ? 'Start building your collection today' : 'Koleksiyonunuzu bugün oluşturmaya başlayın'}
            </p>
            {searchQuery && (
              <Button variant="secondary" size="md" onClick={() => setSearchQuery('')}>
                {t('common.clear')}
              </Button>
            )}
            {activeTab === 'mine' && !searchQuery && (
              <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
                {t('collection.createCollection')}
              </Button>
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
                  className="block bg-surface-elevated rounded border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all group h-full"
                >
                  <div className="aspect-[4/3] bg-surface-alt relative overflow-hidden">
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
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-4xl">
                        🚗
                      </div>
                    )}
                    <div className="absolute top-1.5 right-1.5">
                      {collection.isPublic ? (
                        <span className="px-1.5 py-0.5 bg-success-500/90 text-inverted text-[10px] font-medium rounded">
                          {t('collection.isPublic')}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-body/90 text-inverted text-[10px] font-medium rounded">
                          {t('collection.isPrivate')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <h3 className="font-medium text-heading text-sm line-clamp-1 group-hover:text-primary-600 transition-colors">{collection.name}</h3>
                    {collection.description && (
                      <p className="text-subtle text-[10px] mt-0.5 line-clamp-1">{collection.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[10px] text-subtle">
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
                    <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                      <span className="text-[10px] text-subtle">@{collection.userName || collection.user?.displayName || 'Kullanıcı'}</span>
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
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-elevated rounded max-w-md w-full p-6 text-center"
          >
            <div className="w-14 h-14 bg-primary-50 rounded flex items-center justify-center mx-auto mb-4">
              <FolderPlusIcon className="w-7 h-7 text-primary-500" />
            </div>
            <h2 className="text-lg font-bold text-heading mb-2">Üyelik Yükseltme Gerekli</h2>
            <p className="text-muted text-sm mb-5">
              Koleksiyon oluşturma özelliği Temel ve üzeri üyelikler için aktiftir.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowPremiumModal(false)}>
                Vazgeç
              </Button>
              <Link href="/membership" className="flex-1 px-4 py-2.5 bg-primary-500 text-inverted rounded font-medium hover:bg-primary-600 transition-colors text-center text-sm">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
      <div className="bg-surface-elevated rounded p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4 text-heading">Yeni Koleksiyon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">İsim</label>
            <Input type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-heading placeholder-subtle focus:outline-none focus:border-primary-400"
              placeholder="Hot Wheels Koleksiyonum"
              required />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">Açıklama</label>
            <Textarea value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded text-sm text-heading placeholder-subtle focus:outline-none focus:border-primary-400"
              placeholder="Koleksiyon hakkında..."
              rows={3} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1 font-medium uppercase tracking-wide">Kategori</label>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              selectSize="sm"
            >
              <option value="">Kategori seçin (isteğe bağlı)</option>
              {flatCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPublic"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              label="Herkese açık koleksiyon"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
              İptal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={loading || !name}
              isLoading={loading}
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
