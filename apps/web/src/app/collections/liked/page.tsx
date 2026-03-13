'use client';

import { useEffect } from 'react';
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
  user: {
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
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); }
  }, [isAuthenticated, router]);

  const likedQuery = useQuery({
    queryKey: ['collections-liked'],
    queryFn: async (): Promise<Collection[]> => {
      const response = await collectionsApi.getLiked();
      const data = response.data;
      return data?.collections || data?.data || (Array.isArray(data) ? data : []);
    },
    enabled: isAuthenticated,
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

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <div className="w-1 h-6 bg-orange-500 rounded-sm" />
                {t('collection.likedCollections')}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{t('collection.likedCollectionsDesc')}</p>
            </div>
            <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1.5">
              <ArrowLeftIcon className="w-4 h-4" />
              {t('collection.backToProfile')}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded border border-gray-100 overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button onClick={() => likedQuery.refetch()} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium transition-colors">
              {t('collection.tryAgain')}
            </button>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-20 bg-white rounded border border-gray-200">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-50 rounded mb-4">
              <BookOpenIcon className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-gray-600 text-lg font-medium mb-1">{t('collection.noLikedCollections')}</p>
            <p className="text-gray-400 text-sm mb-4">{t('collection.exploreTip')}</p>
            <Link href="/collections" className="inline-block px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-medium transition-colors">
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
                <div className="bg-white rounded border border-gray-200 overflow-hidden hover:border-orange-300 hover:shadow-md transition-all group h-full flex flex-col">
                  <Link href={`/collections/${collection.id}`}>
                    <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden">
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
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center"><ArchiveBoxIcon className="w-4 h-4 text-gray-400" /></div>
                                );
                              })()}
                            </div>
                          ))}
                          {collection.items.length < 4 &&
                            Array(4 - collection.items.length).fill(0).map((_, i) => (
                              <div key={`empty-${i}`} className="bg-gray-200" />
                            ))}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 text-3xl">🚗</div>
                      )}
                      <div className="absolute bottom-1.5 right-1.5 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-white">
                        {collection.itemCount || 0} {locale === 'en' ? 'items' : 'ürün'}
                      </div>
                    </div>
                  </Link>

                  <div className="p-2.5 flex-1 flex flex-col">
                    <Link href={`/collections/${collection.id}`}>
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-orange-600 transition-colors">{collection.name}</h3>
                    </Link>
                    {collection.description && (
                      <p className="text-gray-400 text-[10px] mt-0.5 line-clamp-1">{collection.description}</p>
                    )}

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <UserAvatar displayName={collection.user?.displayName} size="xs" className="!w-4 !h-4 !text-[8px]" />
                      <span className="text-[10px] text-gray-400">{collection.user?.displayName || t('collection.anonymous')}</span>
                    </div>

                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="flex items-center gap-0.5"><HeartIcon className="w-3 h-3" />{collection.likeCount || 0}</span>
                        <span className="flex items-center gap-0.5"><EyeIcon className="w-3 h-3" />{collection.viewCount || 0}</span>
                      </div>
                      <button
                        onClick={() => handleUnlike(collection.id)}
                        className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-500 rounded text-[10px] font-medium transition-colors"
                      >
                        {t('collection.unlike')}
                      </button>
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
