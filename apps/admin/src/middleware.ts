import { createAuthMiddleware } from '@tarodan/auth/middleware';
import { adminAuthConfig } from '@/lib/auth.config';

/**
 * Edge auth gate + proactive refresh, built on the shared `@tarodan/auth`
 * engine. The admin app owns two httpOnly cookies (`admin_at` / `admin_rt`); on
 * every protected navigation the engine redirects cookieless guests, refreshes a
 * missing/expired access token, and rotates the cookies before RSCs read them.
 * Data calls (`/api/*`) are excluded — the BFF proxy refreshes those itself.
 */
export const middleware = createAuthMiddleware(adminAuthConfig, {
  publicPaths: ['/login', '/forgot-password', '/reset-password'],
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)'],
};
