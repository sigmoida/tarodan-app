import { useState, useEffect } from 'react';
import { Share } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { api, collectionsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useRefresh } from '@/hooks/useRefresh';
import { useAuthStore } from '@/stores/authStore';
import { buildShareContent, collectionShareUrl } from '@/utils/share';

/**
 * Collection detail controller — owns the collection query, optimistic like,
 * share, and derived owner/premium flags. Lifted verbatim from the monolith.
 */
export function useCollectionDetail() {
  const { id } = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuthStore();
  // Premium/business üyeler zaten koleksiyon oluşturabildiği için upsell'i gizle.
  const isPremiumMember =
    user?.membershipTier === 'premium' || user?.membershipTier === 'business';
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  const { data: apiCollection, isLoading, refetch } = useQuery({
    queryKey: ['collection', id],
    queryFn: async () => {
      try {
        const response = await api.get(`/collections/${id}`);
        return response.data.data || response.data;
      } catch {
        return null;
      }
    },
  });

  // NOT: viewCount artık backend'de kullanıcı başına tekilleştiriliyor; aynı kullanıcı
  // refresh'lese/tekrar açsa görüntülenme artmaz. Refetch güvenli.
  const { refreshing, onRefresh } = useRefresh(refetch);

  const collection = apiCollection;
  const items = collection?.items || [];
  // Koleksiyon sahibi: ürün ekleme/düzenleme kontrollerini sadece sahibe göster.
  const isOwner = isAuthenticated && !!user?.id && user.id === collection?.userId;

  // Beğeni durumu/sayısını server'dan senkronize et (web ile parite)
  useEffect(() => {
    if (apiCollection) {
      setIsLiked(!!apiCollection.isLiked);
      setLikeCount(apiCollection.likeCount ?? 0);
    }
  }, [apiCollection]);

  const handleShare = async () => {
    if (!collection) return;
    try {
      const { content, options } = buildShareContent(
        `${collection.name}\n\n${collection.description ?? ''}\n\nTarodan'da bu koleksiyona göz atın!`,
        collectionShareUrl(String(collection.id ?? id)),
        collection.name,
      );
      await Share.share(content, options);
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    const next = !isLiked;
    // Optimistic
    setIsLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      // Server'ın döndürdüğü gerçeği (liked/likeCount) optimistic state'in üstüne yaz.
      const resp: any = next
        ? await collectionsApi.like(String(id))
        : await collectionsApi.unlike(String(id));
      const data = resp?.data?.data ?? resp?.data;
      const serverLiked = typeof data?.liked === 'boolean' ? data.liked : next;
      const serverCount = typeof data?.likeCount === 'number' ? data.likeCount : undefined;
      if (serverCount !== undefined) {
        setIsLiked(serverLiked);
        setLikeCount(serverCount);
      }
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['liked-collections'] });
      queryClient.invalidateQueries({ queryKey: qk.collections.mine });
      // ['collection', id] cache'ini taze tut ki tekrar girince stale (eski isLiked/likeCount)
      // gelmesin. Cache'i elle güncelliyoruz (viewCount backend'de tekilleştirildiği için
      // refetch de güvenli olurdu; yine de gereksiz istekten kaçınıyoruz).
      queryClient.setQueryData(['collection', id], (old: any) =>
        old ? { ...old, isLiked: serverLiked, likeCount: serverCount ?? old.likeCount } : old
      );
    } catch {
      // Rollback
      setIsLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  };

  return {
    id,
    isLoading,
    collection,
    items,
    isOwner,
    isPremiumMember,
    isAuthenticated,
    isLiked,
    likeCount,
    handleShare,
    handleLike,
    refreshing,
    onRefresh,
  };
}

export type CollectionDetailController = ReturnType<typeof useCollectionDetail>;
