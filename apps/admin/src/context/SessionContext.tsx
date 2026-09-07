"use client";

import { createContext, useContext, useEffect } from "react";
import { logoutAction } from "@/lib/server/auth-actions";
import {
  clearSessionDeadline,
  publishServerDeadline,
} from "@/lib/session-deadline";
import type { AdminUser } from "@/lib/server/session";

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
  sessionExpiresAt,
  children,
}: {
  user: AdminUser;
  /** Layout'un sunucuda okuduğu oturum son tarihi (ISO). */
  sessionExpiresAt?: string | null;
  children: React.ReactNode;
}) {
  // Her navigasyonda tazelenir: RSC'nin profil çağrısı oturumu uzatıyor, bu da
  // panelin son tarihini o uzatmayla hizalar.
  useEffect(() => {
    publishServerDeadline(sessionExpiresAt);
  }, [sessionExpiresAt]);

  const logout = async (redirectTo = "/login") => {
    try {
      await logoutAction();
    } finally {
      // Oturumun son tarihi localStorage'da yaşıyor; temizlenmezse bir sonraki
      // (daha kısa pencereli) oturum eski, ileri tarihi devralırdı.
      clearSessionDeadline();
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
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
