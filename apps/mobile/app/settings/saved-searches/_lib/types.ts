export const STORAGE_KEY = 'diecast_saved_searches';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: {
    category?: string;
    brand?: string;
    scale?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    tradeAvailable?: boolean;
  };
  resultCount?: number;
  notifyEnabled: boolean;
  createdAt: string;
  lastRunAt?: string;
}
