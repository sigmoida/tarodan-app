'use client';

import { useAuthStore } from '@/stores/authStore';

/**
 * Use on protected pages so auth is resolved before showing "giriş yapın".
 * Pattern:
 *   const { authLoading, isAuthenticated } = useRequireAuth();
 *   useEffect(() => { if (authLoading) return; if (!isAuthenticated) router.push('/login?redirect=...'); }, [authLoading, isAuthenticated, router]);
 *   if (authLoading) return <AuthLoadingScreen />;
 *   if (!isAuthenticated) return null;
 *   // ... page content
 * Also set query enabled: enabled: !authLoading && isAuthenticated
 */
export function useRequireAuth() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  return { authLoading, isAuthenticated };
}
