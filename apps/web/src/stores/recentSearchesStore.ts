'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RecentSearchesState {
  searches: string[];
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearSearches: () => void;
}

const MAX_SEARCHES = 5;

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      searches: [],
      
      addSearch: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        
        const current = get().searches;
        // Remove if already exists (to move to top)
        const filtered = current.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
        // Add to beginning and limit to MAX_SEARCHES
        const updated = [trimmed, ...filtered].slice(0, MAX_SEARCHES);
        set({ searches: updated });
      },
      
      removeSearch: (query: string) => {
        set(state => ({
          searches: state.searches.filter(s => s !== query)
        }));
      },
      
      clearSearches: () => {
        set({ searches: [] });
      },
    }),
    {
      name: 'recent-searches',
    }
  )
);
