import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Auth gate + proactive refresh at the edge.
 *
 * The admin app owns two httpOnly cookies (set by the BFF): `admin_at`
 * (access) and `admin_rt` (refresh). On every protected navigation:
 *  - no refresh token        → redirect to /login
 *  - access missing/expired  → refresh here (the only cheap place to keep the
 *                              access token fresh before RSCs read it)
 *
 * Data calls (`/api/*`) are excluded — the BFF proxy refreshes those itself.
 */

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];
const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001';

const ACCESS_COOKIE = 'admin_at';
const REFRESH_COOKIE = 'admin_rt';

function isExpired(jwt?: string): boolean {
  if (!jwt) return true;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1] ?? ''));
    // 30s clock-skew margin
    return !payload?.exp || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const access = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!isExpired(access)) {
    return NextResponse.next();
  }

  // Access token missing/expired but the refresh token is present → refresh.
  const res = await fetch(`${API}/api/auth/admin/refresh`, {
    method: 'POST',
    headers: { Cookie: `admin_refresh_token=${refresh}` },
  });
  const tokens = res.ok ? await res.json().catch(() => null) : null;
  if (!tokens?.accessToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const newRefresh = tokens.refreshToken ?? refresh;
  // Propagate to the current request so downstream RSCs read the fresh token…
  request.cookies.set(ACCESS_COOKIE, tokens.accessToken);
  request.cookies.set(REFRESH_COOKIE, newRefresh);
  const response = NextResponse.next({ request: { headers: request.headers } });
  // …and persist to the browser.
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(60 * 30));
  response.cookies.set(REFRESH_COOKIE, newRefresh, cookieOptions(60 * 60 * 24 * 7));
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
};
