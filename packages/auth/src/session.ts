import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { AuthConfig } from "./config";
import { cookieOptions, indicatorCookieOptions } from "./cookies";
import { isExpired } from "./jwt";
import { GATEWAY_CLIENT_IP_HEADER } from "./proxy";
import { isRefreshRejected } from "./refresh-status";

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
  /**
   * `onResponse`: upstream profil yanıtını çağrı başına görmek isteyen çağıran
   * için (admin paneli oturum son tarihi başlığını böyle okur). Modül düzeyinde
   * saklanmaz — sunucu süreci istekler arasında paylaşıldığı için bir
   * kullanıcının oturum bilgisi diğerine sızardı.
   */
  getSession: (opts?: {
    onResponse?: (res: Response) => void;
  }) => Promise<TUser | null>;
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

  async function doRefresh(
    refresh: string,
    clientIp?: string | null,
  ): Promise<RefreshOutcome> {
    // This is a server-to-server BFF call. Sending the token as an upstream
    // auth cookie makes the API's browser CSRF guard require a double-submit
    // header and reject the refresh with 403. Body transport is already
    // supported for native/BFF clients and remains protected by the signed,
    // persisted, rotating refresh token itself.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // The browser's IP (computed by the gateway proxy), so the upstream can
    // tell users apart instead of seeing every refresh from the BFF host.
    if (clientIp) headers[GATEWAY_CLIENT_IP_HEADER] = clientIp;
    let res: Response;
    try {
      res = await fetch(`${apiBaseUrl}${endpoints.refresh}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshToken: refresh }),
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
    // 4xx rejection → the session is genuinely dead. 5xx / 429 / 408 → the API
    // couldn't answer (redeploy, throttle, timeout) → transient, keep the session.
    return isRefreshRejected(res.status)
      ? { status: "dead" }
      : { status: "transient" };
  }

  // Single-flight per refresh token: a page firing many /api calls after expiry
  // spends its rotating token once. Keying this map is essential: a process can
  // serve multiple users concurrently and must never share one user's refreshed
  // credentials with another user.
  //
  // A SUCCESSFUL rotation stays cached for a short window instead of being
  // dropped the moment it settles: requests that left the browser with the OLD
  // refresh cookie (parallel tabs, or an RSC render that couldn't persist the
  // cookies it rotated) land here late, and re-hitting the upstream with the
  // now-revoked token would kill the live session. They get the same new pair.
  // Failed attempts are never cached so retries stay possible.
  const ROTATION_RESULT_TTL_MS = 60_000;
  const inflight = new Map<string, Promise<RefreshOutcome>>();
  const runRefresh = (
    refresh: string,
    clientIp?: string | null,
  ): Promise<RefreshOutcome> => {
    const existing = inflight.get(refresh);
    if (existing) return existing;

    const drop = () => {
      if (inflight.get(refresh) === pending) {
        inflight.delete(refresh);
      }
    };
    const pending: Promise<RefreshOutcome> = doRefresh(refresh, clientIp).then(
      (outcome) => {
        if (outcome.status === "ok") {
          const timer = setTimeout(drop, ROTATION_RESULT_TTL_MS);
          (timer as { unref?: () => void }).unref?.();
        } else {
          drop();
        }
        return outcome;
      },
      (err) => {
        drop();
        throw err;
      },
    );
    inflight.set(refresh, pending);
    return pending;
  };
  // Public toolkit method keeps its historical `tokens | null` shape (nothing
  // consumes the transient/dead nuance outside `apiFetch`).
  const refreshTokens = async (refresh: string) => {
    const outcome = await runRefresh(refresh);
    return outcome.status === "ok" ? outcome.tokens : null;
  };

  // Reads that may go out with an expired/missing access token and rely on the
  // 401 path. Public GETs and polls therefore never refresh up front (and never
  // clear cookies on a dead refresh unless the endpoint itself answers 401).
  const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

  async function apiFetch(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiFetchResult> {
    const { access, refresh } = await readTokens();
    const clientIp = new Headers(init.headers).get(GATEWAY_CLIENT_IP_HEADER);
    const send = (token?: string) => {
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers,
        cache: "no-store",
      });
    };

    /**
     * The ONE refresh-and-resend step (up-front and 401 paths), so the
     * dead/transient mapping can't drift between them. On failure `onFailure`
     * supplies the response to return for that outcome.
     */
    const refreshThenSend = async (
      refreshToken: string,
      onFailure: (status: "dead" | "transient") => Promise<Response> | Response,
    ): Promise<ApiFetchResult> => {
      const outcome = await runRefresh(refreshToken, clientIp);
      if (outcome.status === "ok") {
        const next = outcome.tokens;
        try {
          await writeTokens(next.access, next.refresh);
        } catch {
          /* Server Component context can't write cookies; the proxy/middleware will. */
        }
        return { res: await send(next.access), refreshed: next };
      }
      // Distinguish a rejected token (dead) from a transient upstream failure
      // so the caller doesn't log the user out on a hiccup.
      const res = await onFailure(outcome.status);
      return outcome.status === "dead"
        ? { res, sessionDead: true }
        : { res, transient: true };
    };

    // A MUTATION with an expired/missing access token but a live refresh cookie
    // → refresh FIRST (same expiry rule as the middleware). Sending it bare and
    // waiting for a 401 is not enough: optional-auth endpoints (e.g. POST
    // /payments/direct-form after 15 min on the card form) answer a
    // credential-less request as a GUEST and silently lose the user. Genuine
    // guests (no refresh cookie) never refresh.
    //
    // Failure (one attempt per call, never re-refreshed on a later 401):
    //  - dead (token rejected) → sent as a guest, `sessionDead` (cookies cleared),
    //    exactly what a guest would get;
    //  - transient (API down / throttled) → NOT sent: a mutation must not run as
    //    a guest on a hiccup. A synthetic 503 comes back (`transient`, cookies
    //    kept) so the client can retry.
    const method = (init.method ?? "GET").toUpperCase();
    if (
      refresh &&
      !READ_METHODS.has(method) &&
      isExpired(access, config.jwtSkewMs)
    ) {
      return refreshThenSend(refresh, (status) =>
        status === "dead"
          ? send()
          : new Response(
              JSON.stringify({
                statusCode: 503,
                message: "Session refresh temporarily unavailable; retry.",
              }),
              {
                status: 503,
                headers: { "content-type": "application/json" },
              },
            ),
      );
    }

    const res = await send(access);
    if (res.status === 401 && refresh) {
      // Refresh on 401 and retry once; on failure return the upstream 401.
      return refreshThenSend(refresh, () => res);
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

  /**
   * Oturumu çözer. `onResponse`, upstream yanıtını ÇAĞRI BAŞINA görmek isteyen
   * çağıran içindir (admin paneli oturum son tarihi başlığını böyle okur).
   * Bilerek callback: değeri modül düzeyinde saklamak, sunucu süreci istekler
   * arasında paylaşıldığı için bir kullanıcının oturum bilgisini diğerine
   * sızdırırdı.
   */
  async function getSession(opts?: {
    onResponse?: (res: Response) => void;
  }): Promise<TUser | null> {
    // apiFetch üzerinden: süresi dolmuş access REFRESH edilir (rotasyon cache'i
    // + API grace penceresiyle güvenli). Eski çıplak-fetch hali herhangi bir
    // 401'de refresh denemeden null dönüyor ve layout guard'ları canlı oturumu
    // "expired=session" ile login'e atıyordu.
    const { access, refresh } = await readTokens();
    if (!access && !refresh) return null;
    const { res } = await apiFetch(endpoints.profile);
    opts?.onResponse?.(res);
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
