'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import OptimizedImage from '@/components/OptimizedImage';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  FolderPlusIcon,
  EyeIcon,
  HeartIcon,
  XMarkIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { collectionsApi, categoriesApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import { Button, Input, Select } from '@tarodan/ui';
import CreateCollectionModal from '@/components/CreateCollectionModal';

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
}

type SortOption = 'popular' | 'recent' | 'name' | 'items_asc' | 'items_desc';

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

export default function MyCollectionsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, user, limits } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const { data: categoriesTree } = useQuery({
    queryKey: ['categories', 'collections'],
    queryFn: async () => {
      const res = await categoriesApi.findAll({ refresh: '1' });
      return res.data?.data ?? res.data ?? [];
    },
    meta: { page: 'my-collections-categories' },
  });
  const flatCategories = useMemo(
    () => (Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : []),
    [categoriesTree],
  );

  const myQuery = useQuery({
    queryKey: ['collections', 'mine'],
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getMyCollections();
      const data = response.data?.collections || response.data?.data || [];
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated,
    meta: { page: 'my-collections' },
  });
  const myCollections = myQuery.data ?? [];
  const loading = myQuery.isLoading && !myQuery.data;

  const canCreateCollection = user?.membershipTier !== 'free' || limits?.canCreateCollections;

  const handleCreateClick = () => {
    if (!canCreateCollection) {
      setShowPremiumModal(true);
      return;
    }
    setShowCreateModal(true);
  };

  const displayedCollections = useMemo(() => {
    let result = myCollections;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (collection) =>
          collection.name.toLowerCase().includes(query) ||
          collection.description?.toLowerCase().includes(query)
      );
    }
    const sorted = [...result];
    switch (sortBy) {
      case 'popular':
        sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        break;
      case 'recent':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'name': {
        const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: false });
        sorted.sort((a, b) => collator.compare(a.name.toLowerCase(), b.name.toLowerCase()));
        break;
      }
      case 'items_asc':
        sorted.sort((a, b) => (a.itemCount || 0) - (b.itemCount || 0));
        break;
      case 'items_desc':
        sorted.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
        break;
    }
    return sorted;
  }, [myCollections, searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 gap-3">
          <div>
            <Link href="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-body mb-2 transition-colors">
              <ArrowLeftIcon className="w-4 h-4" />
              {t('common.back')}
            </Link>
            <h1 className="text-3xl font-bold text-heading">{t('collection.myCollections')}</h1>
            <p className="text-muted mt-1">{myCollections.length} {locale === 'en' ? 'collections' : 'koleksiyon'}</p>
          </div>
          {mounted && isAuthenticated && (
            <Button
              variant="primary"
              size="md"
              onClick={handleCreateClick}
              className="flex items-center gap-1.5 flex-shrink-0"
            >
              <FolderPlusIcon className="w-4 h-4" />
              {t('collection.createCollection')}
            </Button>
          )}
        </div>

        {/* Search & Sort Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="w-auto"
            selectSize="sm"
          >
            <option value="recent">{t('common.newest')}</option>
            <option value="popular">{t('common.popular')}</option>
            <option value="name">A-Z</option>
            <option value="items_desc">{t('common.desc')}</option>
            <option value="items_asc">{t('common.asc')}</option>
          </Select>
        </div>

        {/* Collections Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
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
            {searchQuery ? (
              <Button variant="secondary" size="md" onClick={() => setSearchQuery('')}>
                {t('common.clear')}
              </Button>
            ) : (
              <Button variant="primary" size="md" onClick={handleCreateClick}>
                {t('collection.createCollection')}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                        logContext={{ collectionId: collection.id, page: 'my-collections' }}
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
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>

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
