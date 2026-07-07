import { createBffProxy } from '@tarodan/auth';
import { apiFetch, attachSessionCookies } from '@/lib/server/bff-session';

/**
 * BFF proxy for the web app's authenticated client calls.
 *
 * The browser's client axios points at same-origin `/bff/*`; requests land here
 * and are forwarded to NestJS with a server-side `Bearer` header (from the
 * Next-owned `web_at` cookie), refreshing the access token transparently on 401.
 * Guests carry no `web_at` → public/guest endpoints still work through the hop.
 *
 * A separate namespace from `/api/*` on purpose: the existing `/api/:path*` and
 * `/api/payment/callback/:path*` rewrites (PayTR) must keep working untouched.
 */
export const dynamic = 'force-dynamic';

export const { GET, POST, PUT, PATCH, DELETE } = createBffProxy({
  apiFetch,
  attachSessionCookies,
});
