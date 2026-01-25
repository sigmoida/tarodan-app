/**
 * Recent Searches Store
 * Stores the last 5 search queries locally
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_RECENT_SEARCHES = 5;

interface RecentSearch {
  query: string;
  timestamp: number;
}

interface RecentSearchesState {
  searches: RecentSearch[];
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearSearches: () => void;
  getRecentSearches: () => string[];
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      searches: [],

      addSearch: (query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery || trimmedQuery.length < 2) return;

        set((state) => {
          // Remove existing entry if it exists
          const filteredSearches = state.searches.filter(
            (s) => s.query.toLowerCase() !== trimmedQuery.toLowerCase()
          );

          // Add new search at the beginning
          const newSearches = [
            { query: trimmedQuery, timestamp: Date.now() },
            ...filteredSearches,
          ].slice(0, MAX_RECENT_SEARCHES);

          return { searches: newSearches };
        });
      },

      removeSearch: (query: string) => {
        set((state) => ({
          searches: state.searches.filter(
            (s) => s.query.toLowerCase() !== query.toLowerCase()
          ),
        }));
      },

      clearSearches: () => {
        set({ searches: [] });
      },

      getRecentSearches: () => {
        return get().searches.map((s) => s.query);
      },
    }),
    {
      name: 'recent-searches-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
