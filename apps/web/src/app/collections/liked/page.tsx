'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { api, collectionsApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string;
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
  const { isAuthenticated, user } = useAuthStore();
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadLikedCollections();
  }, [isAuthenticated]);

  const loadLikedCollections = async () => {
    setLoading(true);
    setError(null);
    console.log('[LikedCollections] Loading... User:', user?.id, 'isAuthenticated:', isAuthenticated);
    console.log('[LikedCollections] Auth token:', localStorage.getItem('auth_token')?.substring(0, 30) + '...');
    try {
      const response = await collectionsApi.getLiked();
      const data = response.data;
      console.log('[LikedCollections] API Response:', JSON.stringify(data, null, 2).substring(0, 500));
      // Handle different response formats
      const collectionsList = data?.collections || data?.data || (Array.isArray(data) ? data : []);
      console.log('[LikedCollections] Parsed collections count:', collectionsList.length);
      setCollections(collectionsList);
    } catch (err: any) {
      console.error('Liked collections load error:', err);
      console.error('Error details:', err.response?.data);
      
      // Check if it's an auth error
      if (err.response?.status === 401) {
        setError(t('auth.sessionExpired'));
        // Redirect to login
        router.push('/login?redirect=/collections/liked');
        return;
      }
      
      setError(t('collection.loadFailed'));
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlike = async (collectionId: string) => {
    try {
      await collectionsApi.unlike(collectionId);
      setCollections(collections.filter(c => c.id !== collectionId));
    } catch (err: any) {
      alert(err.response?.data?.message || t('collection.unlikeFailed'));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('collection.likedCollections')}</h1>
            <p className="text-gray-400 mt-1">{t('collection.likedCollectionsDesc')}</p>
          </div>
          <Link
            href="/profile"
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← {t('collection.backToProfile')}
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
            <button
              onClick={loadLikedCollections}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              {t('collection.tryAgain')}
            </button>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-xl">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-gray-400 text-lg">{t('collection.noLikedCollections')}</p>
            <p className="text-gray-500 mt-2">{t('collection.exploreTip')}</p>
            <Link
              href="/collections"
              className="inline-block mt-6 px-6 py-3 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors font-medium"
            >
              {t('collection.exploreCollections')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-primary-500/50 transition-all group"
              >
                {/* Collection Preview Images */}
                <Link href={`/collections/${collection.slug || collection.id}`}>
                  <div className="h-48 bg-gray-700 relative">
                    {collection.items && collection.items.length > 0 ? (
                      <div className="grid grid-cols-2 h-full">
                        {collection.items.slice(0, 4).map((item, index) => (
                          <div key={item.id} className="relative overflow-hidden">
                            {item.product?.images?.[0] ? (
                              <img
                                src={item.product.images[0].url}
                                alt={item.product.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-600 flex items-center justify-center">
                                <span className="text-2xl">🚗</span>
                              </div>
                            )}
                          </div>
                        ))}
                        {collection.items.length < 4 &&
                          Array(4 - collection.items.length)
                            .fill(0)
                            .map((_, i) => (
                              <div key={`empty-${i}`} className="bg-gray-600"></div>
                            ))}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-6xl opacity-50">📦</span>
                      </div>
                    )}

                    {/* Item count badge */}
                    <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-xs">
                      {collection.itemCount || 0} {t('collection.items')}
                    </div>
                  </div>
                </Link>

                {/* Collection Info */}
                <div className="p-4">
                  <Link href={`/collections/${collection.slug || collection.id}`}>
                    <h3 className="text-lg font-semibold hover:text-primary-400 transition-colors">
                      {collection.name}
                    </h3>
                  </Link>

                  {collection.description && (
                    <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                      {collection.description}
                    </p>
                  )}

                  {/* Owner */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-primary-500/20 rounded-full flex items-center justify-center text-xs">
                      {collection.user?.avatarUrl ? (
                        <img
                          src={collection.user.avatarUrl}
                          alt={collection.user.displayName}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        collection.user?.displayName?.charAt(0) || '?'
                      )}
                    </div>
                    <span className="text-gray-400 text-sm">
                      {collection.user?.displayName || t('collection.anonymous')}
                    </span>
                  </div>

                  {/* Stats & Actions */}
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <span>❤️</span> {collection.likeCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <span>👁️</span> {collection.viewCount || 0}
                      </span>
                    </div>

                    <button
                      onClick={() => handleUnlike(collection.id)}
                      className="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm transition-colors"
                    >
                      {t('collection.unlike')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
