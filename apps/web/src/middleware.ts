import { createAuthMiddleware } from '@tarodan/auth/middleware';
import { webAuthConfig } from '@/lib/auth.config';

/**
 * Edge auth gate + proactive refresh for the web app's private area, built on
 * the shared `@tarodan/auth` engine (same as admin). On `/profile/*`: no
 * `web_rt` → redirect to /login; `web_at` missing/expired → refresh server-side
 * and rotate the Next-owned cookies before RSCs read them.
 *
 * Only the unambiguously private area is matched. Guest-capable flows (checkout,
 * cart, payment callbacks) and all public/SEO routes are intentionally excluded.
 */
export const middleware = createAuthMiddleware(webAuthConfig, { publicPaths: [] });

export const config = {
	matcher: ['/profile', '/profile/:path*'],
};
