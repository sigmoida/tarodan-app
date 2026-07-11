import { useQuery, useQueryClient } from '@tanstack/react-query';
import { wishlistApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuthStore } from '@/stores/authStore';

export interface WishlistItem {
  id: string;
  productId: string;
  product: {
    id: string;
    title: string;
    price: number;
    images: Array<{ url: string }>;
    condition: string;
    status: string;
    seller: {
      id: string;
      displayName: string;
    };
  };
  addedAt: string;
}

/**
 * Backend `GET /wishlist` yanıtını `WishlistItem[]`'e eşler. Backend, item'ları
 * ya düz alanlarla (productTitle/productImage…) ya da iç içe `product` ile
 * döndürebilir; her iki şekli de tolere eder.
 */
export function mapWishlist(data: any): WishlistItem[] {
  const wishlistData = data?.items || data?.data || data || [];
  return (Array.isArray(wishlistData) ? wishlistData : [])
    .filter((item: any) => item && item.productId)
    .map((item: any) => ({
      id: item.id,
      productId: item.productId,
      product: {
        id: item.productId,
        title: item.productTitle || item.product?.title || 'Ürün',
        price: item.productPrice || item.product?.price || 0,
        images: item.productImage ? [{ url: item.productImage }] : (item.product?.images || []),
        condition: item.productCondition || item.product?.condition || 'good',
        status: item.productStatus || item.product?.status || 'active',
        seller: {
          id: item.sellerId || item.product?.seller?.id || '',
          displayName: item.sellerName || item.product?.seller?.displayName || 'Satıcı',
        },
      },
      addedAt: item.addedAt || item.added_at || new Date().toISOString(),
    }));
}

/**
 * Favoriler (wishlist) — React Query destekli. Eskiden `favoritesStore` (fetch
 * eden zustand) yapıyordu; Faz 1'de tek server-state disiplinine (TanStack Query)
 * taşındı. Davranış birebir korunur: optimistic ekle/çıkar, 409 idempotent, 404
 * toleransı, rollback. Public API (items/isInFavorites/addToFavorites…) store ile
 * aynıdır; böylece tüketiciler neredeyse değişmeden çalışır.
 *
 * Çıkışta reset: `resetUserStores` zaten `queryClient.clear()` çağırır → favori
 * cache'i de temizlenir (ayrı reset gerekmez).
 */
export function useFavorites() {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const query = useQuery({
    queryKey: qk.favorites.all,
    enabled: isAuthenticated,
    queryFn: async (): Promise<WishlistItem[]> => {
      try {
        const response = await wishlistApi.get();
        return mapWishlist(response.data);
      } catch (error: any) {
        // Boş wishlist 404 dönebilir — hata değil, boş liste.
        if (error?.response?.status === 404) return [];
        throw error;
      }
    },
  });

  const items: WishlistItem[] = query.data ?? [];

  // İmperatif kontroller cache'i TAZE okur (closure `items` bayat kalabilir; ör.
  // fetchFavorites().then(() => isInFavorites(id)) akışında sync sonuç şart).
  const readCache = (): WishlistItem[] => qc.getQueryData<WishlistItem[]>(qk.favorites.all) ?? [];

  const isInFavorites = (productId: string) => readCache().some((i) => i.productId === productId);
  const getFavoriteCount = () => items.length;

  const fetchFavorites = () => query.refetch();

  // Web ile aynı endpoint: POST /wishlist
  const addToFavorites = async (productId: string): Promise<boolean> => {
    // Optimistic: anında listeye ekle ki kalp ikonu/badge hemen güncellensin.
    const prev = readCache();
    const alreadyThere = prev.some((i) => i.productId === productId);
    if (!alreadyThere) {
      const optimisticItem: WishlistItem = {
        id: `temp-${productId}`,
        productId,
        product: {
          id: productId,
          title: 'Ürün',
          price: 0,
          images: [],
          condition: 'good',
          status: 'active',
          seller: { id: '', displayName: 'Satıcı' },
        },
        addedAt: new Date().toISOString(),
      };
      qc.setQueryData<WishlistItem[]>(qk.favorites.all, [...prev, optimisticItem]);
    }

    try {
      await wishlistApi.add(productId);
      // Gerçek veriyle senkronize et (optimistic placeholder'ı değiştirir).
      await query.refetch();
      return true;
    } catch (error: any) {
      // Zaten wishlist'te ise yine başarı (idempotent).
      if (error?.response?.status === 409 || error?.response?.data?.message?.includes('zaten')) {
        await query.refetch();
        return true;
      }
      // Rollback optimistic ekleme.
      qc.setQueryData<WishlistItem[]>(qk.favorites.all, (cur) =>
        (cur ?? []).filter((i) => i.productId !== productId),
      );
      return false;
    }
  };

  // Web ile aynı endpoint: DELETE /wishlist/:productId
  const removeFromFavorites = async (productId: string): Promise<boolean> => {
    // Optimistic: anında listeden düş (add ile simetrik).
    const prev = readCache();
    const removed = prev.filter((item) => item.productId === productId);
    qc.setQueryData<WishlistItem[]>(qk.favorites.all, prev.filter((item) => item.productId !== productId));

    try {
      await wishlistApi.remove(productId);
      return true;
    } catch (error: any) {
      // Bulunamadıysa server'da zaten silinmiş — yerel silmeyi koru.
      if (error?.response?.status === 404) {
        return true;
      }
      // Rollback optimistic çıkarma.
      qc.setQueryData<WishlistItem[]>(qk.favorites.all, (cur) => [...(cur ?? []), ...removed]);
      return false;
    }
  };

  // Web ile aynı endpoint: DELETE /wishlist
  const clearFavorites = async (): Promise<void> => {
    try {
      await wishlistApi.clear();
      qc.setQueryData<WishlistItem[]>(qk.favorites.all, []);
    } catch (error) {
      console.error('Failed to clear favorites:', error);
    }
  };

  return {
    items,
    isLoading: query.isLoading,
    error: query.isError ? 'Favoriler yüklenemedi' : null,
    isInFavorites,
    getFavoriteCount,
    fetchFavorites,
    addToFavorites,
    removeFromFavorites,
    clearFavorites,
  };
}
