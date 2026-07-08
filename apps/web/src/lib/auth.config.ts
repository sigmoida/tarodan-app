import type { AuthConfig } from '@tarodan/auth';

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/**
 * The web app's concrete BFF auth config for `@tarodan/auth`. Web owns its OWN
 * httpOnly cookies (`web_at` / `web_rt`), distinct from the NestJS user cookies
 * (`access_token` / `refresh_token`). NestJS returns the tokens in the login /
 * refresh JSON body (see apps/api auth-cookies util), which is what the engine
 * reads. Edge-safe — pure data + a mapper, no `server-only`.
 */
export const webAuthConfig: AuthConfig = {
  cookies: { access: 'web_at', refresh: 'web_rt' },
  apiBaseUrl: `${API}/api`,
  endpoints: {
    login: '/auth/login',
    refresh: '/auth/refresh',
    profile: '/auth/profile',
    logout: '/auth/logout',
    forgotPassword: '/auth/forgot-password',
    google: '/auth/google',
  },
  // NestJS user refresh guard reads the refresh token from this cookie.
  upstreamRefreshCookie: 'refresh_token',
  ttls: {
    accessMaxAge: 60 * 15, // 15 min — matches the user JWT access TTL
    refreshMaxAge: 60 * 60 * 24 * 7, // 7 days
  },
  jwtSkewMs: 30_000,
  isProd: process.env.NODE_ENV === 'production',
};

/** Server-resolved web user (from `/auth/profile`). Extend as SSR needs more. */
export interface WebUser {
  id: string;
  email: string;
  displayName: string;
  role?: string;
  isSeller: boolean;
  membershipTier?: string;
  companyName?: string;
  taxId?: string;
  businessStatus?: 'pending' | 'approved' | 'rejected';
  avatarUrl?: string;
}

/** Map the `/auth/profile` payload to a WebUser (null when invalid). */
export function mapWebUser(raw: unknown): WebUser | null {
  const wrap = raw as { user?: unknown } | null;
  const u = (wrap?.user ?? wrap) as Record<string, unknown> | null;
  if (!u || (!u.id && !u.email)) return null;
  return {
    id: String(u.id ?? ''),
    email: String(u.email ?? ''),
    displayName: String(u.displayName ?? u.display_name ?? ''),
    role: (u.role as string | undefined) ?? undefined,
    isSeller: Boolean(u.isSeller ?? u.is_seller ?? false),
    membershipTier:
      (u.membershipTier as string | undefined) ?? (u.membership_tier as string | undefined),
    companyName: (u.companyName as string | undefined) ?? (u.company_name as string | undefined),
    taxId: (u.taxId as string | undefined) ?? (u.tax_id as string | undefined),
    businessStatus: (u.businessStatus ?? u.business_status) as
      | 'pending'
      | 'approved'
      | 'rejected'
      | undefined,
    avatarUrl: (u.avatarUrl as string | undefined) ?? (u.avatar_url as string | undefined),
  };
}
