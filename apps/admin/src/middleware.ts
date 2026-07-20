import { createAuthMiddleware } from "@tarodan/auth/middleware";
import { adminAuthConfig } from "@/lib/auth.config";

/**
 * Edge auth gate + proactive refresh, built on the shared `@tarodan/auth`
 * engine. The admin app owns two httpOnly cookies (`admin_at` / `admin_rt`); on
 * every protected navigation the engine redirects cookieless guests, refreshes a
 * missing/expired access token, and rotates the cookies before RSCs read them.
 * Data calls (`/gateway/*`) are excluded — the gateway proxy refreshes those itself.
 *
 * The auth pages (`/login`, …) are `guestOnlyPaths`: a logged-in user is bounced
 * to `/dashboard` here at the edge instead of in the async `(auth)` layout, which
 * flashed a blank frame during the post-login revalidation (same fix as web).
 */
export const middleware = createAuthMiddleware(adminAuthConfig, {
  publicPaths: [],
  guestOnlyPaths: ["/login", "/forgot-password", "/reset-password"],
  authedHome: "/dashboard",
  requestPathHeader: "x-admin-pathname",
  expiredSessionReason: "session",
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|gateway(?:/|$)|.*\\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|map|woff2?|ttf|eot)$).*)",
  ],
};
