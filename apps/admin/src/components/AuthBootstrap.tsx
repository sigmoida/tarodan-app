'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * Uygulama açılışında cookie tabanlı oturumu bir kez doğrular (checkAuth).
 * Token artık httpOnly cookie'de olduğu için auth durumu yalnızca sunucudan öğrenilir.
 */
export default function AuthBootstrap() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return null;
}
