import 'server-only';

import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

/**
 * Server-only session core for the BFF.
 *
 * The browser never sees the NestJS tokens. On login we store them in the
 * admin app's OWN httpOnly cookies (below); every call to NestJS is made
 * server-side with an `Authorization: Bearer` header, and access tokens are
 * refreshed server-side (in Server Actions / Route Handlers / middleware —
 * the only places Next.js allows writing cookies).
 */

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

/** Next-owned cookies (distinct from NestJS's admin_token/admin_refresh_token). */
export const ACCESS_COOKIE = 'admin_at';
export const REFRESH_COOKIE = 'admin_rt';

const ACCESS_MAX_AGE = 60 * 30; // 30 min — matches the API access TTL
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function readTokens() {
  const store = cookies();
  return {
    access: store.get(ACCESS_COOKIE)?.value,
    refresh: store.get(REFRESH_COOKIE)?.value,
  };
}

/** Writable only in Server Actions / Route Handlers. */
export function writeTokens(access: string, refresh: string) {
  const store = cookies();
  store.set(ACCESS_COOKIE, access, cookieOptions(ACCESS_MAX_AGE));
  store.set(REFRESH_COOKIE, refresh, cookieOptions(REFRESH_MAX_AGE));
}

export function clearTokens() {
  const store = cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

/**
 * Server-side refresh: the NestJS /auth/admin/refresh reads the refresh token
 * from the `admin_refresh_token` cookie, so we forward it as a Cookie header.
 * Returns the new tokens or null.
 */
async function doRefresh(
  refresh: string,
): Promise<{ access: string; refresh: string } | null> {
  const res = await fetch(`${API}/api/auth/admin/refresh`, {
    method: 'POST',
    headers: { Cookie: `admin_refresh_token=${refresh}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const tokens = await res.json().catch(() => null);
  if (!tokens?.accessToken) return null;
  return { access: tokens.accessToken, refresh: tokens.refreshToken ?? refresh };
}

// Single-flight: a page firing many /api calls at once after the access token
// expired would otherwise trigger N concurrent refreshes. Since the API ROTATES
// the refresh token (invalidating the old one), only the first would succeed and
// the rest would 401 → bounce to /login even though the session is still valid.
// Sharing one in-flight refresh spends the rotating token exactly once.
let inflightRefresh: Promise<{ access: string; refresh: string } | null> | null = null;

export function refreshTokens(
  refresh: string,
): Promise<{ access: string; refresh: string } | null> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh(refresh).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

export interface ApiFetchResult {
  res: Response;
  /**
   * Present when this call refreshed the access token. The caller MUST persist
   * these onto its outgoing response (`attachSessionCookies`) — writing via the
   * `cookies()` store alone is unreliable when a Route Handler returns a
   * hand-built `NextResponse`, which would leave the browser on the old (now
   * rotated/invalid) refresh token and bounce it to /login on the next call.
   */
  refreshed?: { access: string; refresh: string };
}

/**
 * Call the NestJS API server-side with the current access token. On 401,
 * refreshes once and retries; the refreshed tokens are returned so the caller
 * can persist them on its own response.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<ApiFetchResult> {
  const { access, refresh } = readTokens();
  const authHeaders = (token?: string) => {
    const h = new Headers(init.headers);
    if (token) h.set('Authorization', `Bearer ${token}`);
    return h;
  };

  let res = await fetch(`${API}/api${path}`, {
    ...init,
    headers: authHeaders(access),
    cache: 'no-store',
  });

  if (res.status === 401 && refresh) {
    const next = await refreshTokens(refresh);
    if (next) {
      // Best-effort persistence for Server Action contexts; the BFF proxy also
      // sets these on its own response (the reliable path — see route.ts).
      try {
        writeTokens(next.access, next.refresh);
      } catch {
        /* Server Component context can't write cookies; the proxy/middleware will. */
      }
      res = await fetch(`${API}/api${path}`, {
        ...init,
        headers: authHeaders(next.access),
        cache: 'no-store',
      });
      return { res, refreshed: next };
    }
  }
  return { res };
}

/** Persist a refreshed session onto an outgoing response (reliable cookie write). */
export function attachSessionCookies(
  res: NextResponse,
  tokens: { access: string; refresh: string },
) {
  res.cookies.set(ACCESS_COOKIE, tokens.access, cookieOptions(ACCESS_MAX_AGE));
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, cookieOptions(REFRESH_MAX_AGE));
}

/** Base URL for the NestJS API (used by the proxy Route Handler). */
export function apiBaseUrl() {
  return `${API}/api`;
}

/**
 * Resolve the current admin from the session cookie by validating it against
 * /auth/admin/profile. Returns null when there is no valid session.
 *
 * NOTE: safe to call from Server Components — it never writes cookies. If the
 * access token is expired, middleware refreshes it before the request reaches
 * here; a 401 at this point means the session is genuinely gone.
 */
export async function getSession(): Promise<AdminUser | null> {
  const { access } = readTokens();
  if (!access) return null;

  const res = await fetch(`${apiBaseUrl()}/auth/admin/profile`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const u = await res.json().catch(() => null);
  if (!u || (!u.id && !u.email)) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    avatarUrl: u.avatarUrl,
  };
}
