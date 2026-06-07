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
      const response = await api.getListings({
        page: currentPage,
        ...filters,
      });
      
      set({
        listings: reset ? response.listings : [...listings, ...response.listings],
        page: currentPage + 1,
        hasMore: response.listings.length >= 20,
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
      const response = await api.getListing(id);
      set({ currentListing: response.listing, isLoading: false });
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
      await api.createListing(data);
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


