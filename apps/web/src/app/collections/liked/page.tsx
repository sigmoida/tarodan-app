'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import { BookOpenIcon, ArchiveBoxIcon, ArrowLeftIcon, EyeIcon, HeartIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { api, collectionsApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';
import { motion } from 'framer-motion';
import { Button } from '@tarodan/ui';

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
  coverImageUrl?: string;
  isPublic: boolean;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  createdAt: string;
  userId?: string;
  userName?: string;
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  items?: {
    id: string;
    product: {
      id: string;
      title: string;
      images: { url: string }[];
    };
  }[];
}

export default function LikedCollectionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const { t, locale } = useTranslation();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) { router.push('/login?redirect=/collections/liked'); }
  }, [mounted, isAuthenticated, authLoading, router]);

  const likedQuery = useQuery({
    queryKey: ['collections-liked'],
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getLiked();
      const data = response.data;
      return data?.collections || data?.data || (Array.isArray(data) ? data : []);
    },
    enabled: !authLoading && isAuthenticated,
    refetchOnMount: 'always',
    meta: { page: 'collections-liked' },
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 401) return false;
      return failureCount < 2;
    },
  });
  const collections = likedQuery.data ?? [];
  const loading = likedQuery.isLoading;
  const error = likedQuery.isError
    ? (likedQuery.error as any)?.response?.status === 401
      ? t('auth.sessionExpired')
      : t('collection.loadFailed')
    : null;

  useEffect(() => {
    if ((likedQuery.error as any)?.response?.status === 401 && isAuthenticated) {
      router.push('/login?redirect=/collections/liked');
    }
  }, [likedQuery.error, isAuthenticated, router]);

  const handleUnlike = async (collectionId: string) => {
    try {
      await collectionsApi.unlike(collectionId);
      await queryClient.invalidateQueries({ queryKey: ['collections-liked'] });
    } catch (err: any) {
      alert(err.response?.data?.message || t('collection.unlikeFailed'));
    }
  };

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="animate-pulse text-muted text-sm">
            {locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-surface">
      {/* Page Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-heading flex items-center gap-2">
                <div className="w-1 h-6 bg-primary-500 rounded-sm" />
                {t('collection.likedCollections')}
              </h1>
              <p className="text-sm text-muted mt-0.5">{t('collection.likedCollectionsDesc')}</p>
            </div>
            <Link href="/profile" className="text-sm text-muted hover:text-body transition-colors flex items-center gap-1.5">
              <ArrowLeftIcon className="w-4 h-4" />
              {t('collection.backToProfile')}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
        {(!mounted || !isAuthenticated || loading) ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-border-subtle" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-border-subtle rounded w-3/4" />
                  <div className="h-3 bg-border-subtle rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-surface-elevated rounded border border-border">
            <p className="text-danger-500 text-sm mb-3">{error}</p>
            <Button variant="secondary" onClick={() => likedQuery.refetch()} className="px-4 py-2 bg-surface-alt hover:bg-border-subtle text-body rounded text-sm font-medium transition-colors">
              {t('collection.tryAgain')}
            </Button>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-20 bg-surface-elevated rounded border border-border">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded mb-4">
              <BookOpenIcon className="w-7 h-7 text-subtle" />
            </div>
            <p className="text-muted text-lg font-medium mb-1">{t('collection.noLikedCollections')}</p>
            <p className="text-subtle text-sm mb-4">{t('collection.exploreTip')}</p>
            <Link href="/collections" className="inline-block px-5 py-2 bg-primary-500 hover:bg-primary-600 text-inverted rounded text-sm font-medium transition-colors">
              {t('collection.exploreCollections')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {collections.map((collection, index) => (
              <motion.div
                key={collection.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <div className="bg-surface-elevated rounded border border-border overflow-hidden hover:border-primary-300 hover:shadow-md transition-all group h-full flex flex-col">
                  <Link href={`/collections/${collection.id}`}>
                    <div className="aspect-[4/3] bg-surface-alt relative overflow-hidden">
                      {collection.coverImageUrl ? (
                        <OptimizedImage
                          src={collection.coverImageUrl}
                          alt={collection.name}
                          fill
                          className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          fallbackSrc="https://placehold.co/400x300/f3f4f6/9ca3af?text=Koleksiyon"
                          logContext={{ collectionId: collection.id, page: 'collections-liked' }}
                        />
                      ) : collection.items && collection.items.length > 0 ? (
                        <div className="grid grid-cols-2 h-full">
                          {collection.items.slice(0, 4).map((item) => (
                            <div key={item.id} className="relative overflow-hidden">
                              {(() => {
                                const img0 = item.product?.images?.[0];
                                const url = (img0 as any)?.cardUrl ?? (img0 as any)?.detailUrl ?? (img0 as any)?.url;
                                return url ? (
                                  <OptimizedImage src={url} alt={item.product!.title} fill className="object-cover"
                                    fallbackSrc="https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün" logContext={{ productId: item.product.id, page: 'collections-liked-item' }} />
                                ) : (
                                  <div className="w-full h-full bg-border-subtle flex items-center justify-center"><ArchiveBoxIcon className="w-4 h-4 text-subtle" /></div>
                                );
                              })()}
                            </div>
                          ))}
                          {collection.items.length < 4 &&
                            Array(4 - collection.items.length).fill(0).map((_, i) => (
                              <div key={`empty-${i}`} className="bg-border-subtle" />
                            ))}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-3xl">🚗</div>
                      )}
                      <div className="absolute bottom-1.5 right-1.5 bg-heading/60 px-1.5 py-0.5 rounded text-[10px] text-inverted">
                        {collection.itemCount || 0} {locale === 'en' ? 'items' : 'ürün'}
                      </div>
                    </div>
                  </Link>

                  <div className="p-2.5 flex-1 flex flex-col">
                    <Link href={`/collections/${collection.id}`}>
                      <h3 className="font-medium text-heading text-sm line-clamp-1 group-hover:text-primary-600 transition-colors">{collection.name}</h3>
                    </Link>
                    {collection.description && (
                      <p className="text-subtle text-[10px] mt-0.5 line-clamp-1">{collection.description}</p>
                    )}

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <UserAvatar displayName={collection.user?.displayName || collection.userName} avatarUrl={collection.user?.avatarUrl} size="xs" className="!w-4 !h-4 !text-[8px]" />
                      <span className="text-[10px] text-subtle">{collection.user?.displayName || collection.userName || t('collection.anonymous')}</span>
                    </div>

                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-subtle">
                        <span className="flex items-center gap-0.5"><HeartIcon className="w-3 h-3" />{collection.likeCount || 0}</span>
                        <span className="flex items-center gap-0.5"><EyeIcon className="w-3 h-3" />{collection.viewCount || 0}</span>
                      </div>
                      <Button variant="secondary" onClick={() => handleUnlike(collection.id)}
                        className="px-2 py-1 bg-danger-50 hover:bg-danger-100 text-danger-500 rounded text-[10px] font-medium transition-colors">
                        {t('collection.unlike')}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
