import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { AuthConfig } from "./config";
import { cookieOptions, indicatorCookieOptions } from "./cookies";

export interface ApiFetchResult {
  res: Response;
  /**
   * Present when this call refreshed the access token. The caller MUST persist
   * these onto its outgoing response (`attachSessionCookies`) — a Route Handler
   * that returns a hand-built `NextResponse` would otherwise leave the browser
   * on the old (rotated/invalid) refresh token and bounce it to /login.
   */
  refreshed?: { access: string; refresh: string };
  /**
   * The refresh token was explicitly REJECTED by the upstream (4xx) → the
   * session is genuinely dead. The caller should clear the session cookies (and
   * the JS-readable indicator) so client and server agree. Distinct from a
   * transient failure below.
   */
  sessionDead?: boolean;
  /**
   * A 401 came back but the refresh could NOT be completed for a transient
   * reason (network error / upstream 5xx — e.g. the API restarting mid-deploy).
   * The session may well still be valid, so the caller must NOT clear cookies or
   * eject the user; treat it as a temporary error and retry later.
   */
  transient?: boolean;
}

/** Outcome of a single upstream refresh attempt. */
type RefreshOutcome =
  | { status: "ok"; tokens: { access: string; refresh: string } }
  | { status: "dead" } // upstream rejected the refresh token (4xx) → session invalid
  | { status: "transient" }; // network / 5xx / malformed → can't tell, keep session

export interface SessionToolkit<TUser> {
  readTokens: () => Promise<{ access?: string; refresh?: string }>;
  writeTokens: (access: string, refresh: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  refreshTokens: (
    refresh: string,
  ) => Promise<{ access: string; refresh: string } | null>;
  apiFetch: (path: string, init?: RequestInit) => Promise<ApiFetchResult>;
  attachSessionCookies: (
    res: NextResponse,
    tokens: { access: string; refresh: string },
  ) => void;
  /**
   * Expire the app's session cookies (access, refresh, and the JS-readable
   * indicator) on an outgoing response. Used when a call proves the session is
   * dead (`ApiFetchResult.sessionDead`) so the browser's marker stops claiming a
   * session that no longer exists.
   */
  clearSessionCookies: (res: NextResponse) => void;
  getSession: () => Promise<TUser | null>;
  apiBaseUrl: () => string;
}

/**
 * The server-only session core for one Next.js BFF app. Owns the app's httpOnly
 * cookies, refreshes the access token server-side (single-flight, since the
 * refresh token rotates), and calls the upstream API with a `Bearer` header.
 *
 * `mapUser` turns the upstream `/profile` payload into the app's user type
 * (return `null` for an invalid/absent user).
 */
export function createSession<TUser>(
  config: AuthConfig,
  mapUser: (raw: unknown) => TUser | null,
): SessionToolkit<TUser> {
  const {
    cookies: names,
    apiBaseUrl,
    endpoints,
    upstreamRefreshCookie,
    ttls,
    indicatorCookie,
  } = config;
  const isProd = config.isProd ?? process.env.NODE_ENV === "production";

  const readTokens = async () => {
    const store = await cookies();
    return {
      access: store.get(names.access)?.value,
      refresh: store.get(names.refresh)?.value,
    };
  };

  const writeTokens = async (access: string, refresh: string) => {
    const store = await cookies();
    store.set(names.access, access, cookieOptions(ttls.accessMaxAge, isProd));
    store.set(
      names.refresh,
      refresh,
      cookieOptions(ttls.refreshMaxAge, isProd),
    );
    // JS-readable indicator, synced to the session so the client never drifts.
    if (indicatorCookie) {
      store.set(
        indicatorCookie,
        "1",
        indicatorCookieOptions(ttls.refreshMaxAge, isProd),
      );
    }
  };

  const clearTokens = async () => {
    const store = await cookies();
    store.delete(names.access);
    store.delete(names.refresh);
    if (indicatorCookie) store.delete(indicatorCookie);
  };

  async function doRefresh(refresh: string): Promise<RefreshOutcome> {
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl}${endpoints.refresh}`, {
        method: "POST",
        headers: { Cookie: `${upstreamRefreshCookie}=${refresh}` },
        cache: "no-store",
      });
    } catch {
      // Network error reaching the API (down / restarting mid-deploy). We CANNOT
      // conclude the refresh token is invalid — treat as transient.
      return { status: "transient" };
    }
    if (res.ok) {
      const tokens = await res.json().catch(() => null);
      if (tokens?.accessToken) {
        return {
          status: "ok",
          tokens: {
            access: tokens.accessToken,
            refresh: tokens.refreshToken ?? refresh,
          },
        };
      }
      // 2xx but no token (malformed) — don't kill a possibly-valid session.
      return { status: "transient" };
    }
    // 5xx = upstream hiccup (e.g. API redeploying) → transient, keep the session.
    // 4xx = the refresh token was rejected → the session is genuinely dead.
    return res.status >= 500 ? { status: "transient" } : { status: "dead" };
  }

  // Single-flight: a page firing many /api calls after the access token expired
  // would otherwise trigger N concurrent refreshes. Since the API ROTATES the
  // refresh token, only the first would succeed and the rest would 401 → bounce
  // to /login. Sharing one in-flight refresh spends the rotating token once.
  let inflight: Promise<RefreshOutcome> | null = null;
  const runRefresh = (refresh: string): Promise<RefreshOutcome> => {
    if (!inflight) {
      inflight = doRefresh(refresh).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };
  // Public toolkit method keeps its historical `tokens | null` shape (nothing
  // consumes the transient/dead nuance outside `apiFetch`).
  const refreshTokens = async (refresh: string) => {
    const outcome = await runRefresh(refresh);
    return outcome.status === "ok" ? outcome.tokens : null;
  };

  async function apiFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiFetchResult> {
    const { access, refresh } = await readTokens();
    const authHeaders = (token?: string) => {
      const h = new Headers(init.headers);
      if (token) h.set("Authorization", `Bearer ${token}`);
      return h;
    };

    let res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: authHeaders(access),
      cache: "no-store",
    });

    if (res.status === 401 && refresh) {
      const outcome = await runRefresh(refresh);
      if (outcome.status === "ok") {
        const next = outcome.tokens;
        try {
          await writeTokens(next.access, next.refresh);
        } catch {
          /* Server Component context can't write cookies; the proxy/middleware will. */
        }
        res = await fetch(`${apiBaseUrl}${path}`, {
          ...init,
          headers: authHeaders(next.access),
          cache: "no-store",
        });
        return { res, refreshed: next };
      }
      // Refresh failed: distinguish a rejected token (dead) from a transient
      // upstream failure so the caller doesn't log the user out on a hiccup.
      if (outcome.status === "dead") return { res, sessionDead: true };
      return { res, transient: true };
    }
    return { res };
  }

  const attachSessionCookies = (
    res: NextResponse,
    tokens: { access: string; refresh: string },
  ) => {
    res.cookies.set(
      names.access,
      tokens.access,
      cookieOptions(ttls.accessMaxAge, isProd),
    );
    res.cookies.set(
      names.refresh,
      tokens.refresh,
      cookieOptions(ttls.refreshMaxAge, isProd),
    );
    if (indicatorCookie) {
      res.cookies.set(
        indicatorCookie,
        "1",
        indicatorCookieOptions(ttls.refreshMaxAge, isProd),
      );
    }
  };

  const clearSessionCookies = (res: NextResponse) => {
    res.cookies.set(names.access, "", { path: "/", maxAge: 0 });
    res.cookies.set(names.refresh, "", { path: "/", maxAge: 0 });
    if (indicatorCookie)
      res.cookies.set(indicatorCookie, "", { path: "/", maxAge: 0 });
  };

  async function getSession(): Promise<TUser | null> {
    const { access } = await readTokens();
    if (!access) return null;
    const res = await fetch(`${apiBaseUrl}${endpoints.profile}`, {
      headers: { Authorization: `Bearer ${access}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const raw = await res.json().catch(() => null);
    return mapUser(raw);
  }

  return {
    readTokens,
    writeTokens,
    clearTokens,
    refreshTokens,
    apiFetch,
    attachSessionCookies,
    clearSessionCookies,
    getSession,
    apiBaseUrl: () => apiBaseUrl,
  };
}
