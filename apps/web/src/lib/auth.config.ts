import type { AuthConfig } from "@tarodan/auth";
import { getServerApiOrigin } from "@/lib/api/origin";

const API = getServerApiOrigin();

/**
 * The web app's concrete BFF auth config for `@tarodan/auth`. Web owns its OWN
 * httpOnly cookies (`web_at` / `web_rt`), distinct from the NestJS user cookies
 * (`access_token` / `refresh_token`). NestJS returns the tokens in the login /
 * refresh JSON body (see apps/api auth-cookies util), which is what the engine
 * reads. Edge-safe — pure data + a mapper, no `server-only`.
 */
export const webAuthConfig: AuthConfig = {
  cookies: { access: "web_at", refresh: "web_rt" },
  // JS-readable session indicator, written by the engine alongside web_at/web_rt.
  // The client reads THIS (not a self-written localStorage flag) so its auth
  // signal can never drift from the real session — see stores/authStore.ts.
  indicatorCookie: "tarodan_authed",
  apiBaseUrl: `${API}/api`,
  endpoints: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    profile: "/auth/profile",
    logout: "/auth/logout",
    forgotPassword: "/auth/forgot-password",
    google: "/auth/google",
  },
  // NestJS user refresh guard reads the refresh token from this cookie.
  upstreamRefreshCookie: "refresh_token",
  ttls: {
    accessMaxAge: 60 * 15, // 15 min — matches the user JWT access TTL
    refreshMaxAge: 60 * 60 * 24 * 7, // 7 days
  },
  jwtSkewMs: 30_000,
  // Drives the `Secure` cookie flag. Honor an explicit `COOKIE_SECURE=true` too,
  // so a prod deploy that forgets NODE_ENV=production still ships Secure cookies
  // (otherwise session tokens could transmit over plaintext HTTP).
  isProd:
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "true",
};

/** Server-resolved web user (from `/auth/profile`). Extend as SSR needs more. */
export interface WebUser {
  id: string;
  adminCode?: string;
  username?: string;
  usernameClaimed?: boolean;
  email: string;
  displayName: string;
  role?: string;
  isSeller: boolean;
  membershipTier?: string;
  companyName?: string;
  taxId?: string;
  businessStatus?: "pending" | "approved" | "rejected";
  avatarUrl?: string;
}

/** Map the `/auth/profile` payload to a WebUser (null when invalid). */
export function mapWebUser(raw: unknown): WebUser | null {
  const wrap = raw as { user?: unknown } | null;
  const u = (wrap?.user ?? wrap) as Record<string, unknown> | null;
  if (!u || (!u.id && !u.email)) return null;
  return {
    id: String(u.id ?? ""),
    adminCode:
      (u.adminCode as string | undefined) ??
      (u.admin_code as string | undefined),
    username: (u.username as string | undefined) ?? undefined,
    usernameClaimed: Boolean(u.usernameClaimed ?? u.username_claimed ?? false),
    email: String(u.email ?? ""),
    displayName: String(u.displayName ?? u.display_name ?? ""),
    role: (u.role as string | undefined) ?? undefined,
    isSeller: Boolean(u.isSeller ?? u.is_seller ?? false),
    membershipTier:
      (u.membershipTier as string | undefined) ??
      (u.membership_tier as string | undefined),
    companyName:
      (u.companyName as string | undefined) ??
      (u.company_name as string | undefined),
    taxId: (u.taxId as string | undefined) ?? (u.tax_id as string | undefined),
    businessStatus: (u.businessStatus ?? u.business_status) as
      "pending" | "approved" | "rejected" | undefined,
    avatarUrl:
      (u.avatarUrl as string | undefined) ??
      (u.avatar_url as string | undefined),
  };
}
