import { createAuthMiddleware } from "@tarodan/auth/middleware";
import { webAuthConfig } from "@/lib/auth.config";

/**
 * Edge auth gate + proactive refresh for the web app's private area, built on
 * the shared `@tarodan/auth` engine (same as admin). On a matched path: no
 * `web_rt` → redirect to /login?redirect=…; `web_at` missing/expired → refresh
 * server-side and rotate the Next-owned cookies before RSCs read them.
 *
 * Matched: the `/profile/*`, `/seller/*` and `/products/*` account areas, the
 * owner-only edit flows (`/listings/[id]/edit`, `/collections/[id]/edit`), and the
 * other authenticated-only pages that previously relied ONLY on a client
 * `useEffect` redirect (content flashed before bouncing): `/wishlist`,
 * `/collections/liked`, `/listings/new`, `/support`, `/membership/checkout`.
 * Guest-capable flows (checkout, cart, payment callbacks) and public/SEO routes —
 * including the `/membership` tiers page and public collection views — are
 * intentionally excluded so guests are never bounced off them.
 */
export const middleware = createAuthMiddleware(webAuthConfig, {
  publicPaths: [],
  guestOnlyPaths: [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
});

export const config = {
  matcher: [
    "/profile",
    "/profile/:path*",
    "/seller",
    "/seller/:path*",
    "/products",
    "/products/:path*",
    "/listings/:id/edit",
    "/listings/new",
    "/collections/:id/edit",
    "/collections/liked",
    "/wishlist",
    "/support",
    "/support/:path*",
    "/membership/checkout",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
