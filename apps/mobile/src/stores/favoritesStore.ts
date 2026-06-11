import { create } from 'zustand';
import { wishlistApi } from '../services/api';

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

interface FavoritesState {
  items: WishlistItem[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchFavorites: () => Promise<void>;
  addToFavorites: (productId: string) => Promise<boolean>;
  removeFromFavorites: (productId: string) => Promise<boolean>;
  clearFavorites: () => Promise<void>;
  
  // Helpers
  isInFavorites: (productId: string) => boolean;
  getFavoriteCount: () => number;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  // Web ile aynı endpoint: GET /wishlist
  fetchFavorites: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await wishlistApi.get();
      console.log('📦 Wishlist raw response:', JSON.stringify(response.data).substring(0, 500));
      
      // Backend returns: { id, userId, items: [...], totalItems, createdAt }
      // items içinde: { id, productId, productTitle, productImage, productPrice, productCondition, sellerId, sellerName, addedAt }
      const wishlistData = response.data?.items || response.data?.data || response.data || [];
      
      // Map API response to our interface
      const items: WishlistItem[] = (Array.isArray(wishlistData) ? wishlistData : [])
        .filter((item: any) => item && item.productId)
        .map((item: any) => ({
          id: item.id,
          productId: item.productId,
          product: {
            id: item.productId,
            // Backend doğrudan productTitle, productImage vs. döndürüyor
            title: item.productTitle || item.product?.title || 'Ürün',
            price: item.productPrice || item.product?.price || 0,
            images: item.productImage 
              ? [{ url: item.productImage }] 
              : (item.product?.images || []),
            condition: item.productCondition || item.product?.condition || 'good',
            status: item.productStatus || item.product?.status || 'active',
            seller: {
              id: item.sellerId || item.product?.seller?.id || '',
              displayName: item.sellerName || item.product?.seller?.displayName || 'Satıcı',
            },
          },
          addedAt: item.addedAt || item.added_at || new Date().toISOString(),
        }));

      console.log('📦 Parsed wishlist items:', items.length);
      set({ items, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch favorites:', error);
      // Don't show error for 404 (empty wishlist is valid)
      if (error.response?.status !== 404) {
        set({ error: 'Favoriler yüklenemedi', isLoading: false });
      } else {
        set({ items: [], isLoading: false });
      }
    }
  },

  // Web ile aynı endpoint: POST /wishlist
  addToFavorites: async (productId: string) => {
    // Optimistic: anında listeye ekle ki kalp ikonu/badge hemen güncellensin.
    const alreadyThere = get().items.some((i) => i.productId === productId);
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
      set((state) => ({ items: [...state.items, optimisticItem], error: null }));
    }

    try {
      await wishlistApi.add(productId);
      // Gerçek veriyle senkronize et (optimistic placeholder'ı değiştirir).
      await get().fetchFavorites();
      return true;
    } catch (error: any) {
      console.error('Failed to add to favorites:', error);

      // If already in wishlist, still return success (idempotent)
      if (error.response?.status === 409 || error.response?.data?.message?.includes('zaten')) {
        await get().fetchFavorites();
        return true;
      }

      // Rollback optimistic ekleme.
      set((state) => ({
        items: state.items.filter((i) => i.productId !== productId),
        error: 'Favorilere eklenemedi',
      }));
      return false;
    }
  },

  // Web ile aynı endpoint: DELETE /wishlist/:productId
  removeFromFavorites: async (productId: string) => {
    // Optimistic: anında listeden düş ki kalp ikonu/badge hemen güncellensin (add ile simetrik).
    const removed = get().items.filter(item => item.productId === productId);
    set(state => ({
      items: state.items.filter(item => item.productId !== productId),
      error: null,
    }));

    try {
      await wishlistApi.remove(productId);
      return true;
    } catch (error: any) {
      console.error('Failed to remove from favorites:', error);

      // If not found, already removed server-side — keep local removal
      if (error.response?.status === 404) {
        return true;
      }

      // Rollback optimistic çıkarma.
      set(state => ({
        items: [...state.items, ...removed],
        error: 'Favorilerden çıkarılamadı',
      }));
      return false;
    }
  },

  // Web ile aynı endpoint: DELETE /wishlist
  clearFavorites: async () => {
    try {
      await wishlistApi.clear();
      set({ items: [] });
    } catch (error: any) {
      console.error('Failed to clear favorites:', error);
      set({ error: 'Favoriler temizlenemedi' });
    }
  },

  isInFavorites: (productId: string) => {
    return get().items.some(item => item.productId === productId);
  },

  getFavoriteCount: () => {
    return get().items.length;
  },
}));

export default useFavoritesStore;
