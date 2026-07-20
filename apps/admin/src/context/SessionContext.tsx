'use client';

import { createContext, useContext } from 'react';
import { logoutAction } from '@/lib/server/auth-actions';
import type { AdminUser } from '@/lib/server/session';

interface SessionValue {
  /** Always present — the (admin) layout gates on a valid session server-side. */
  user: AdminUser;
  isAuthenticated: boolean;
  logout: (redirectTo?: string) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Provides the server-resolved admin user to client components. Hydrated once
 * by the (admin) layout (a Server Component) — the client never fetches or
 * stores the session itself.
 */
export function SessionProvider({
  user,
  children,
}: {
  user: AdminUser;
  children: React.ReactNode;
}) {
  const logout = async (redirectTo = '/login') => {
    try {
      await logoutAction();
    } finally {
      window.location.assign(redirectTo);
    }
  };

  return (
    <SessionContext.Provider value={{ user, isAuthenticated: true, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
