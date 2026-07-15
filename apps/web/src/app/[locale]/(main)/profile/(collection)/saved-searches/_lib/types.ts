/** @format */

export interface SavedSearch {
  id: string;
  query: string;
  filters?: {
    category?: string;
    brand?: string;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
  };
  createdAt: string;
  notifyEnabled: boolean;
}

/** localStorage bucket for saved searches (shared with the "save this search" CTA). */
export const STORAGE_KEY = "diecast_saved_searches";
