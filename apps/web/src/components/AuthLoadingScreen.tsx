'use client';

/**
 * Shown while auth state is being resolved (e.g. checkAuth in progress).
 * Use on protected pages so we don't flash "giriş yapın" before auth is known.
 *
 * Pattern: get authLoading from useAuthStore(); if (authLoading) return <AuthLoadingScreen />;
 * Only then check !isAuthenticated and redirect. See useRequireAuth in lib/useRequireAuth.ts.
 */
export default function AuthLoadingScreen() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Yükleniyor...</p>
      </div>
    </div>
  );
}
