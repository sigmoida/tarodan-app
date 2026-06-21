'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * Uygulama açılışında cookie tabanlı oturumu bir kez doğrular (checkAuth).
 * Token artık httpOnly cookie'de olduğu için auth durumu yalnızca sunucudan öğrenilir.
 *
 * Logout sonrası "anında tekrar giriş" race condition'ını önlemek için:
 * logout() sessionStorage'a 'admin-just-logged-out' koyar; burada checkAuth atlanır.
 */
export default function AuthBootstrap() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('admin-just-logged-out')) {
        sessionStorage.removeItem('admin-just-logged-out');
        // checkAuth atlanıyor — oturumu kapatmış kullanıcıyı login'de tut.
        setLoading(false);
        return;
      }
    } catch {}
    void checkAuth();
  }, [checkAuth, setLoading]);

  return null;
}
