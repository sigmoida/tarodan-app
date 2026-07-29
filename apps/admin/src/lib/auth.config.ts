import type { AuthConfig } from "@tarodan/auth";

function resolveApiOrigin(): string {
  const configured =
    process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  throw new Error(
    "API_INTERNAL_URL or NEXT_PUBLIC_API_URL is required in production",
  );
}

const API = resolveApiOrigin();

/**
 * The admin app's concrete BFF auth config. The shared `@tarodan/auth` engine is
 * app-agnostic; everything admin-specific (its own httpOnly cookie names, the
 * `/auth/admin/*` endpoints, TTLs) lives here. Edge-safe — pure data + a mapper,
 * no `server-only`, so `middleware.ts` can import it.
 */
export const adminAuthConfig: AuthConfig = {
  cookies: { access: "admin_at", refresh: "admin_rt" },
  apiBaseUrl: `${API}/api`,
  endpoints: {
    login: "/auth/admin/login",
    refresh: "/auth/admin/refresh",
    profile: "/auth/admin/profile",
    logout: "/auth/admin/logout",
    forgotPassword: "/auth/forgot-password",
  },
  ttls: {
    // Cookie retention is intentionally longer than the current 15-minute JWT.
    // Middleware reads the JWT's own `exp` and refreshes it before expiry.
    accessMaxAge: 60 * 30,
    refreshMaxAge: 60 * 60 * 24 * 7, // 7 days
  },
  jwtSkewMs: 30_000,
  // Secure is mandatory outside local development and cannot be disabled by a
  // missing/mistyped production env. COOKIE_SECURE enables it for HTTPS dev too.
  isProd:
    process.env.NODE_ENV !== "development" ||
    process.env.COOKIE_SECURE === "true",
};

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

/** Map the `/auth/admin/profile` payload to an AdminUser (null when invalid). */
export function mapAdminUser(raw: unknown): AdminUser | null {
  const u = raw as Record<string, unknown> | null;
  if (!u || (!u.id && !u.email)) return null;
  return {
    id: String(u.id ?? ""),
    email: String(u.email ?? ""),
    displayName: String(u.displayName ?? ""),
    role: String(u.role ?? ""),
    avatarUrl: (u.avatarUrl as string | undefined) ?? undefined,
  };
}
