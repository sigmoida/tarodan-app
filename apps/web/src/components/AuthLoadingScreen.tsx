'use client';

import { Spinner } from '@tarodan/ui';

/**
 * Shown while auth state is being resolved (e.g. checkAuth in progress).
 * Use on protected pages so we don't flash "giriş yapın" before auth is known.
 *
 * Pattern: get authLoading from useAuthStore(); if (authLoading) return <AuthLoadingScreen />;
 * Only then check !isAuthenticated and redirect. See useRequireAuth in lib/useRequireAuth.ts.
 */
export default function AuthLoadingScreen() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted">Yükleniyor...</p>
      </div>
    </div>
  );
}
