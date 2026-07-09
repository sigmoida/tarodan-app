import { createAuthMiddleware } from "@tarodan/auth/middleware";
import { webAuthConfig } from "@/lib/auth.config";

/**
 * Edge auth gate + proactive refresh for the web app's private area, built on
 * the shared `@tarodan/auth` engine (same as admin). On a matched path: no
 * `web_rt` → redirect to /login?redirect=…; `web_at` missing/expired → refresh
 * server-side and rotate the Next-owned cookies before RSCs read them.
 *
 * Matched: the `/profile/*`, `/seller/*` and `/products/*` account areas plus the owner-only
 * edit flows (`/listings/[id]/edit`, `/collections/[id]/edit`) — these are
 * behind auth and previously relied only on a client `useEffect` redirect
 * (content flashed before bouncing). Guest-capable flows (checkout, cart,
 * payment callbacks) and all public/SEO routes are intentionally excluded.
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
    "/collections/:id/edit",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
};
