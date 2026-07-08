'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

/**
 * Auth readiness for protected `/profile/*` pages.
 *
 * The account area is already gated authoritatively on the server
 * (`middleware.ts` at the edge + `profile/layout.tsx` `getSession()` redirect)
 * AND redirected once for the whole subtree in `ProfileContext`. So pages do NOT
 * redirect again — they only need to know when the client auth store has
 * resolved, to gate their queries (`enabled: ready`) and show a loading state.
 *
 * `ready` is hydration-safe: it stays `false` until after mount, so the SSR
 * output and the first client render match (no flash / mismatch). Pages that
 * also need the user object read it from `useAuthStore` directly.
 *
 * Usage:
 *   const { ready, authLoading, isAuthenticated } = useRequireAuth();
 *   const { data } = useThing(ready);          // enabled: ready
 *   if (!ready) return <AuthLoadingScreen />;  // or a page-specific skeleton
 */
export function useRequireAuth() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ready = mounted && !authLoading && isAuthenticated;
  return { mounted, authLoading, isAuthenticated, ready };
}
