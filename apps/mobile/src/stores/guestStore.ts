import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GuestState {
  // View tracking (reset daily — see viewCountsDate)
  productViewCount: number;
  listingViewCount: number;
  searchCount: number;
  /** Gün damgası; yeni günde view sayaçları sıfırlanır (#76 — yoksa +1'ler
   *  sonsuza dek birikip eşik gating'ini kalıcı tetikliyordu). */
  viewCountsDate: string | null;

  // Prompt tracking
  lastPromptShown: string | null;
  promptsShownToday: number;
  lastPromptDate: string | null;
  
  // Actions
  incrementProductView: () => void;
  incrementListingView: () => void;
  incrementSearch: () => void;
  setLastPromptShown: (promptType: string) => void;
  canShowPrompt: () => boolean;
  getPromptType: () => 'favorites' | 'message' | 'purchase' | null;
  resetDailyPrompts: () => void;
}

const MAX_PROMPTS_PER_DAY = 3;
const PRODUCTS_BEFORE_FAVORITES_PROMPT = 10;
const SEARCHES_BEFORE_PROMPT = 5;

export const useGuestStore = create<GuestState>()(
  persist(
    (set, get) => ({
      productViewCount: 0,
      listingViewCount: 0,
      searchCount: 0,
      viewCountsDate: null,
      lastPromptShown: null,
      promptsShownToday: 0,
      lastPromptDate: null,

      incrementProductView: () => {
        const today = new Date().toDateString();
        set((state) => {
          const fresh = state.viewCountsDate !== today;
          return {
            viewCountsDate: today,
            productViewCount: (fresh ? 0 : state.productViewCount) + 1,
            listingViewCount: fresh ? 0 : state.listingViewCount,
            searchCount: fresh ? 0 : state.searchCount,
          };
        });
      },

      incrementListingView: () => {
        const today = new Date().toDateString();
        set((state) => {
          const fresh = state.viewCountsDate !== today;
          return {
            viewCountsDate: today,
            listingViewCount: (fresh ? 0 : state.listingViewCount) + 1,
            productViewCount: fresh ? 0 : state.productViewCount,
            searchCount: fresh ? 0 : state.searchCount,
          };
        });
      },

      incrementSearch: () => {
        const today = new Date().toDateString();
        set((state) => {
          const fresh = state.viewCountsDate !== today;
          return {
            viewCountsDate: today,
            searchCount: (fresh ? 0 : state.searchCount) + 1,
            productViewCount: fresh ? 0 : state.productViewCount,
            listingViewCount: fresh ? 0 : state.listingViewCount,
          };
        });
      },

      setLastPromptShown: (promptType: string) => {
        const today = new Date().toDateString();
        const state = get();
        
        if (state.lastPromptDate !== today) {
          // Reset daily counter
          set({
            lastPromptShown: promptType,
            promptsShownToday: 1,
            lastPromptDate: today,
          });
        } else {
          set({
            lastPromptShown: promptType,
            promptsShownToday: state.promptsShownToday + 1,
          });
        }
      },

      canShowPrompt: () => {
        const state = get();
        const today = new Date().toDateString();
        
        // Reset counter if new day
        if (state.lastPromptDate !== today) {
          return true;
        }
        
        return state.promptsShownToday < MAX_PROMPTS_PER_DAY;
      },

      getPromptType: () => {
        const state = get();
        
        if (!state.canShowPrompt()) {
          return null;
        }
        
        // After viewing 10 products: favorites prompt
        if (state.productViewCount >= PRODUCTS_BEFORE_FAVORITES_PROMPT && 
            state.lastPromptShown !== 'favorites') {
          return 'favorites';
        }
        
        // After 5 searches: general signup prompt
        if (state.searchCount >= SEARCHES_BEFORE_PROMPT && 
            state.lastPromptShown !== 'message') {
          return 'message';
        }
        
        return null;
      },

      resetDailyPrompts: () => {
        set({
          promptsShownToday: 0,
          lastPromptDate: null,
        });
      },
    }),
    {
      name: 'tarodan-guest',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useGuestStore;
