import 'server-only';

import { cookies } from 'next/headers';

/**
 * Server-only session reader for the marketplace.
 *
 * Auth lives in the backend's httpOnly cookies (`access_token` / `refresh_token`,
 * set by NestJS on `/auth/login`). The browser never sees the token values. A
 * Server Component resolves "who is this request" by forwarding those cookies to
 * the API's profile endpoint — the same source of truth the client uses, just
 * read on the server so pages can gate/redirect before rendering.
 *
 * This is the foundation for authenticated SSR across the app. v1 does NOT
 * refresh an expired access token (an expired session simply reads as
 * logged-out, which is safe for the auth-group redirect guard); add a refresh
 * hop here when authed data pages need it.
 */

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/** Cookie names the NestJS user-auth sets (see apps/api auth-cookies util). */
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

/** Minimal server-resolved user. Extend as SSR pages need more fields. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role?: string;
  isSeller: boolean;
  businessStatus?: 'pending' | 'approved' | 'rejected';
  avatarUrl?: string;
}

/**
 * Resolve the current user from the request cookies, or null when there is no
 * valid session. Safe to call from Server Components / layouts — it never writes
 * cookies.
 */
export async function getSession(): Promise<AuthUser | null> {
  const store = cookies();
  // No auth cookie at all → guest; skip the network round-trip.
  if (!store.get(ACCESS_COOKIE) && !store.get(REFRESH_COOKIE)) return null;

  let res: Response;
  try {
    res = await fetch(`${API}/api/auth/profile`, {
      headers: { Cookie: store.toString() },
      cache: 'no-store',
    });
  } catch {
    // API unreachable — treat as guest rather than crashing the render.
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as { user?: unknown } | null;
  const u = (body && (body.user ?? body)) as Record<string, unknown> | null;
  if (!u || (!u.id && !u.email)) return null;

  return {
    id: String(u.id ?? ''),
    email: String(u.email ?? ''),
    displayName: String(u.displayName ?? u.display_name ?? ''),
    role: (u.role as string | undefined) ?? undefined,
    isSeller: Boolean(u.isSeller ?? u.is_seller ?? false),
    businessStatus: (u.businessStatus ?? u.business_status) as
      | 'pending'
      | 'approved'
      | 'rejected'
      | undefined,
    avatarUrl: (u.avatarUrl ?? u.avatar_url) as string | undefined,
  };
}
