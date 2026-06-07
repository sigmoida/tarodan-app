/**
 * Listings Store using Zustand
 */

import { create } from 'zustand';
import api from '../services/api';

interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  brand: string;
  scale: string;
  year: number;
  condition: string;
  images: string[];
  seller: {
    id: number;
    username: string;
    rating: number;
  };
  category: string;
  trade_available: boolean;
  created_at: string;
}

interface ListingsState {
  listings: Listing[];
  currentListing: Listing | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  filters: {
    category?: string;
    brand?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
    tradeOnly?: boolean;
  };
  
  fetchListings: (reset?: boolean) => Promise<void>;
  fetchListing: (id: number) => Promise<void>;
  createListing: (data: FormData) => Promise<void>;
  setFilters: (filters: Partial<ListingsState['filters']>) => void;
  resetFilters: () => void;
}

export const useListingsStore = create<ListingsState>((set, get) => ({
  listings: [],
  currentListing: null,
  isLoading: false,
  error: null,
  page: 1,
  hasMore: true,
  filters: {},
  
  fetchListings: async (reset = false) => {
    const { page, filters, listings } = get();
    const currentPage = reset ? 1 : page;
    
    set({ isLoading: true, error: null });
    
    try {
      const axiosResponse = await api.get('/products', {
        params: { page: currentPage, ...filters },
      });
      const response: any = axiosResponse.data?.data ?? axiosResponse.data ?? { listings: [] };
      const fetched: any[] = response.listings ?? response.products ?? [];

      set({
        listings: reset ? fetched : [...listings, ...fetched],
        page: currentPage + 1,
        hasMore: fetched.length >= 20,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'İlanlar yüklenemedi',
        isLoading: false,
      });
    }
  },
  
  fetchListing: async (id: number) => {
    set({ isLoading: true, error: null, currentListing: null });
    
    try {
      const axiosResponse = await api.get(`/products/${id}`);
      const response: any = axiosResponse.data?.data ?? axiosResponse.data ?? {};
      set({ currentListing: response.listing ?? response, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'İlan yüklenemedi',
        isLoading: false,
      });
    }
  },
  
  createListing: async (data: FormData) => {
    set({ isLoading: true, error: null });
    
    try {
      await api.post('/products', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set({ isLoading: false });
      // Refresh listings
      get().fetchListings(true);
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'İlan oluşturulamadı',
        isLoading: false,
      });
      throw error;
    }
  },
  
  setFilters: (filters) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
    get().fetchListings(true);
  },
  
  resetFilters: () => {
    set({ filters: {} });
    get().fetchListings(true);
  },
}));

export default useListingsStore;


