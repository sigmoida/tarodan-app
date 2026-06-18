import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  /** Cookie tabanlı oturumu doğrula: profile 200 → girişli, 401 → değil. */
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Eski localStorage anahtarlarını tek seferlik temizle. Token/auth artık
 * httpOnly cookie'lerde; bu sayede mevcut oturumlarda DevTools'taki değerler de kaybolur.
 */
function purgeLegacyAuthStorage() {
  if (typeof window === 'undefined') return;
  ['admin_token', 'admin_refresh_token', 'admin_user', 'admin-auth'].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* yoksay */
    }
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setLoading: (isLoading) => set({ isLoading }),

  checkAuth: async () => {
    purgeLegacyAuthStorage();
    set({ isLoading: true });
    try {
      // 401 olursa api interceptor'ı cookie ile sessiz refresh deneyip tekrarlar.
      const res = await api.get('/auth/admin/profile');
      const u = res.data;
      set({
        user: {
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          role: u.role,
          avatarUrl: u.avatarUrl,
        },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/admin/logout');
    } catch {
      /* yoksay — yine de oturumu kapatıyoruz */
    }
    purgeLegacyAuthStorage();
    set({ user: null, isAuthenticated: false, isLoading: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
}));
