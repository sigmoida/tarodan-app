import { create } from 'zustand';
import { api } from '../services/api';

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

  fetchFavorites: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get('/wishlist');
      const wishlistData = response.data?.items || response.data?.data || response.data || [];
      
      // Map API response to our interface
      const items: WishlistItem[] = (Array.isArray(wishlistData) ? wishlistData : [])
        .filter((item: any) => item && (item.product || item.productId))
        .map((item: any) => ({
          id: item.id,
          productId: item.productId || item.product?.id,
          product: item.product || {
            id: item.productId,
            title: item.title || 'Ürün',
            price: item.price || 0,
            images: item.images || [],
            condition: item.condition || 'good',
            status: item.status || 'active',
            seller: item.seller || { id: '', displayName: '' },
          },
          addedAt: item.addedAt || item.added_at || new Date().toISOString(),
        }));

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

  addToFavorites: async (productId: string) => {
    try {
      const response = await api.post('/wishlist', { productId });
      
      // Refresh the favorites list after adding
      await get().fetchFavorites();
      
      return true;
    } catch (error: any) {
      console.error('Failed to add to favorites:', error);
      
      // If already in wishlist, still return success (idempotent)
      if (error.response?.status === 409 || error.response?.data?.message?.includes('zaten')) {
        return true;
      }
      
      set({ error: 'Favorilere eklenemedi' });
      return false;
    }
  },

  removeFromFavorites: async (productId: string) => {
    try {
      await api.delete(`/wishlist/${productId}`);
      
      // Remove from local state immediately
      set(state => ({
        items: state.items.filter(item => item.productId !== productId),
      }));
      
      return true;
    } catch (error: any) {
      console.error('Failed to remove from favorites:', error);
      
      // If not found, still return success
      if (error.response?.status === 404) {
        set(state => ({
          items: state.items.filter(item => item.productId !== productId),
        }));
        return true;
      }
      
      set({ error: 'Favorilerden çıkarılamadı' });
      return false;
    }
  },

  clearFavorites: async () => {
    try {
      await api.delete('/wishlist');
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
