import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { useFavorites } from '@/hooks/useFavorites';
import { invalidateProductLists } from '../_lib/invalidate';
import type { Product } from '../_lib/types';

type Notify = (message: string, type: 'success' | 'error') => void;

/**
 * Favori (beğeni) durumu + toggle. Beğeni sayısı server likeCount'undan
 * senkronlanır ve optimistic güncellenir.
 *
 * Favoriler `useFavorites` (React Query) üzerinden gelir — davranış korunur;
 * bu hook'un dışına (çağıran ekrana) hiçbir değişiklik sızmaz.
 */
export function useProductFavorite({
  product,
  productId,
  isAuthenticated,
  notify,
}: {
  product: Product | null | undefined;
  productId: string;
  isAuthenticated: boolean;
  notify: Notify;
}) {
  const queryClient = useQueryClient();
  const { addToFavorites, removeFromFavorites, isInFavorites, fetchFavorites } =
    useFavorites();

  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  // Giriş yapılıysa favoride mi kontrol et.
  useEffect(() => {
    if (isAuthenticated && productId) {
      fetchFavorites().then(() => setIsFavorite(isInFavorites(productId)));
    }
  }, [isAuthenticated, productId]);

  // Beğeni sayısını server likeCount'undan senkronla.
  useEffect(() => {
    if (product) setFavoriteCount(product.likeCount ?? 0);
  }, [product]);

  const toggle = async () => {
    if (!isAuthenticated) {
      notify('Favorilere eklemek için üye olun', 'error');
      setTimeout(() => router.push('/(auth)/login'), 1500);
      return;
    }
    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        const success = await removeFromFavorites(productId);
        if (success) {
          setIsFavorite(false);
          setFavoriteCount((c) => Math.max(0, c - 1));
          invalidateProductLists(queryClient);
          queryClient.invalidateQueries({ queryKey: qk.products.detail(productId) });
          notify('Favorilerden kaldırıldı', 'success');
        } else {
          notify('Favorilerden kaldırılamadı', 'error');
        }
      } else {
        const success = await addToFavorites(productId);
        if (success) {
          setIsFavorite(true);
          setFavoriteCount((c) => c + 1);
          invalidateProductLists(queryClient);
          queryClient.invalidateQueries({ queryKey: qk.products.detail(productId) });
          notify('Favorilere eklendi!', 'success');
        } else {
          notify('Favorilere eklenemedi', 'error');
        }
      }
    } catch {
      notify('Bir hata oluştu', 'error');
    } finally {
      setFavoriteLoading(false);
    }
  };

  return { isFavorite, favoriteCount, favoriteLoading, toggle };
}
