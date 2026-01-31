/**
 * Type-safe localStorage wrapper
 */
export const storage = {
  get<T>(key: string, defaultValue?: T): T | null {
    if (typeof window === 'undefined') return defaultValue ?? null;
    
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : (defaultValue ?? null);
    } catch {
      return defaultValue ?? null;
    }
  },

  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Storage set error:', error);
      }
    }
  },

  remove(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
  },

  clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.clear();
  },

  // Session storage
  session: {
    get<T>(key: string, defaultValue?: T): T | null {
      if (typeof window === 'undefined') return defaultValue ?? null;
      
      try {
        const item = sessionStorage.getItem(key);
        return item ? JSON.parse(item) : (defaultValue ?? null);
      } catch {
        return defaultValue ?? null;
      }
    },

    set<T>(key: string, value: T): void {
      if (typeof window === 'undefined') return;
      
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Session storage set error:', error);
        }
      }
    },

    remove(key: string): void {
      if (typeof window === 'undefined') return;
      sessionStorage.removeItem(key);
    },

    clear(): void {
      if (typeof window === 'undefined') return;
      sessionStorage.clear();
    },
  },
};

// Storage keys
export const STORAGE_KEYS = {
  TOKEN: 'tarodan-token',
  REFRESH_TOKEN: 'tarodan-refresh-token',
  USER: 'tarodan-user',
  CART: 'tarodan-cart',
  WISHLIST: 'tarodan-wishlist',
  THEME: 'tarodan-theme',
  LOCALE: 'tarodan-locale',
  RECENT_SEARCHES: 'tarodan-recent-searches',
  VIEWED_PRODUCTS: 'tarodan-viewed-products',
} as const;
