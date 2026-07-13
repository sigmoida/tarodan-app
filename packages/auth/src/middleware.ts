import { NextResponse, type NextRequest } from "next/server";
import type { AuthConfig } from "./config";
import { isExpired } from "./jwt";
import { cookieOptions, indicatorCookieOptions } from "./cookies";

export interface AuthMiddlewareOptions {
  /** Paths that never require auth (login, forgot-password, …). */
  publicPaths: string[];
  /** Where to send unauthenticated users. Default `/login`. */
  loginPath?: string;
  /**
   * Guest-only paths (login, register, forgot-password, …). An already-authed
   * user hitting one — via a real navigation, NOT an RSC prefetch/revalidation —
   * is bounced to `authedHome`. Doing this at the edge (before render) replaces
   * the async `(auth)` layout guard that flashed a blank frame during the
   * post-login route revalidation. Prefetch/RSC requests are left alone so that
   * revalidation can't retrigger that blank.
   */
  guestOnlyPaths?: string[];
  /** Where to send authed users who hit a guest-only path. Default `/`. */
  authedHome?: string;
}

/**
 * Edge auth gate + proactive token refresh, factored out of the admin app.
 *
 * On every protected navigation: no refresh token → redirect to login; access
 * token missing/expired → refresh here (the cheapest place to keep it fresh
 * before RSCs read it) and rotate the cookies. Edge-safe: imports only the pure
 * `jwt`/`cookies` helpers, never the `server-only` session core.
 *
 * Import from `@tarodan/auth/middleware` (NOT the package root) so no
 * `server-only` module is pulled into the Edge bundle.
 */
export function createAuthMiddleware(
  config: AuthConfig,
  options: AuthMiddlewareOptions,
) {
  const isProd = config.isProd ?? process.env.NODE_ENV === "production";
  const skew = config.jwtSkewMs ?? 30_000;
  const loginPath = options.loginPath ?? "/login";

  return async function middleware(
    request: NextRequest,
  ): Promise<NextResponse> {
    const { pathname } = request.nextUrl;

    if (options.publicPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    const refresh = request.cookies.get(config.cookies.refresh)?.value;

    // Guest-only pages: bounce an authed user to home, let guests through. Only
    // on real navigations — an RSC prefetch or the Server Action revalidation
    // that fires right after login also hits `/login`, and redirecting THAT is
    // exactly what re-streamed a blank document. Detect those via Next's RSC
    // headers and leave them untouched.
    const isGuestOnly = (options.guestOnlyPaths ?? []).some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (isGuestOnly) {
      const isRscRequest =
        request.headers.has("rsc") ||
        request.headers.has("next-router-prefetch");
      if (refresh && !isRscRequest) {
        return NextResponse.redirect(
          new URL(options.authedHome ?? "/", request.url),
        );
      }
      return NextResponse.next();
    }

    if (!refresh) {
      const loginUrl = new URL(loginPath, request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const res = NextResponse.redirect(loginUrl);
      // No session → clear any stale JS-readable indicator so the client can't
      // mistakenly render as authed on the next page.
      if (config.indicatorCookie)
        res.cookies.set(config.indicatorCookie, "", { path: "/", maxAge: 0 });
      return res;
    }

    const access = request.cookies.get(config.cookies.access)?.value;
    if (!isExpired(access, skew)) {
      // Valid session — make sure the JS-readable indicator reflects it. This
      // self-heals sessions created before the indicator existed and keeps it
      // fresh on every authed navigation.
      if (config.indicatorCookie) {
        const res = NextResponse.next();
        res.cookies.set(
          config.indicatorCookie,
          "1",
          indicatorCookieOptions(config.ttls.refreshMaxAge, isProd),
        );
        return res;
      }
      return NextResponse.next();
    }

    // Access token missing/expired but the refresh token is present → refresh.
    let refreshRes: Response | null = null;
    try {
      refreshRes = await fetch(
        `${config.apiBaseUrl}${config.endpoints.refresh}`,
        {
          method: "POST",
          headers: { Cookie: `${config.upstreamRefreshCookie}=${refresh}` },
        },
      );
    } catch {
      // Network error reaching the API (down / restarting mid-deploy) → transient.
      refreshRes = null;
    }
    const tokens = refreshRes?.ok
      ? await refreshRes.json().catch(() => null)
      : null;
    if (!tokens?.accessToken) {
      // Only EJECT when the refresh token was explicitly rejected (4xx) — a
      // genuinely dead session. A network error / 5xx / malformed 2xx is a
      // transient upstream failure (e.g. the API redeploying); the session may
      // well still be valid, so keep it: let the request through on the current
      // (expired) token and retry the refresh on the next navigation. Otherwise
      // a deploy blip would bounce authed users off protected pages to /login.
      const dead = !!refreshRes && !refreshRes.ok && refreshRes.status < 500;
      if (!dead) return NextResponse.next();
      const redirect = NextResponse.redirect(new URL(loginPath, request.url));
      if (config.indicatorCookie)
        redirect.cookies.set(config.indicatorCookie, "", {
          path: "/",
          maxAge: 0,
        });
      return redirect;
    }

    const newRefresh = tokens.refreshToken ?? refresh;
    // Propagate to the current request so downstream RSCs read the fresh token…
    request.cookies.set(config.cookies.access, tokens.accessToken);
    request.cookies.set(config.cookies.refresh, newRefresh);
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    // …and persist to the browser.
    response.cookies.set(
      config.cookies.access,
      tokens.accessToken,
      cookieOptions(config.ttls.accessMaxAge, isProd),
    );
    response.cookies.set(
      config.cookies.refresh,
      newRefresh,
      cookieOptions(config.ttls.refreshMaxAge, isProd),
    );
    // Keep the JS-readable indicator alive across the rotation.
    if (config.indicatorCookie) {
      response.cookies.set(
        config.indicatorCookie,
        "1",
        indicatorCookieOptions(config.ttls.refreshMaxAge, isProd),
      );
    }
    return response;
  };
}
