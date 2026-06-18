import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  /** Cookie tabanlı oturumu doğrula: profile 200 → kullanıcıyı tazele. */
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Eski GÜVENSİZ token anahtarlarını tek seferlik temizle. Token/auth artık httpOnly
 * cookie'lerde; bu sayede mevcut oturumlarda DevTools'taki token değerleri de kaybolur.
 * Not: yeni persist anahtarı 'admin-session' yalnızca kullanıcı bilgisini (ad/rol/email)
 * tutar — hassas değildir, token İÇERMEZ — bu yüzden silinmez.
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setLoading: (isLoading) => set({ isLoading }),

      checkAuth: async () => {
        purgeLegacyAuthStorage();
        set({ isLoading: true });
        try {
          // 401 olursa api interceptor'ı cookie ile sessiz refresh deneyip tekrarlar;
          // gerçekten geçersizse interceptor /login'e yönlendirir.
          const res = await api.get('/auth/admin/profile');
          const u = res?.data;
          if (u && (u.id || u.email)) {
            set({
              user: {
                id: u.id,
                email: u.email,
                displayName: u.displayName,
                role: u.role,
                avatarUrl: u.avatarUrl,
              },
              isAuthenticated: true,
            });
          }
        } catch {
          // Geçici hata (ağ/5xx) menüyü uçurmasın: persist edilmiş kullanıcıyı SİLME.
          // Oturum gerçekten bittiyse middleware + api interceptor zaten /login'e atar.
        } finally {
          set({ isLoading: false });
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
    }),
    {
      name: 'admin-session',
      // SADECE kullanıcı bilgisi persist edilir (token DEĞİL). Sayfa yenilenince menü/isim
      // anında gelsin diye; checkAuth arka planda doğrular/tazeler.
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = !!state.user;
        }
      },
    },
  ),
);
