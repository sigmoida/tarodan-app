import { NextResponse, type NextRequest } from "next/server";
import type { ApiFetchResult } from "./session";

interface ProxySession {
  apiFetch: (path: string, init?: RequestInit) => Promise<ApiFetchResult>;
  attachSessionCookies: (
    res: NextResponse,
    tokens: { access: string; refresh: string },
  ) => void;
  /**
   * Optional. When provided, the proxy calls it to expire the session cookies
   * (incl. the JS-readable indicator) on a response whose refresh proved the
   * session dead, so the browser stops signalling a session that's gone. Apps
   * that don't pass it keep the previous behaviour (no clearing).
   */
  clearSessionCookies?: (res: NextResponse) => void;
}

type RouteCtx = { params: { path: string[] } };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Reject traversal and encoded separators before a route segment is appended
 * to the fixed API base path. Decode repeatedly to catch double-encoded input.
 */
function hasUnsafePathSegment(path: string[]): boolean {
  return path.some((segment) => {
    let decoded = segment;
    for (let pass = 0; pass < 10; pass += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        return true;
      }
    }
    return (
      decoded === "." ||
      decoded === ".." ||
      /[\\/]/.test(decoded) ||
      /%(?:25|2e|2f|5c)/i.test(decoded)
    );
  });
}

/**
 * CSRF defense for the gateway. The proxy attaches a server-side Bearer to
 * whatever it forwards and the API also accepts cookie auth, so without this the
 * only barrier is SameSite=Lax — which has gaps (the Lax+POST 2-minute window,
 * same-site subdomain attackers). On a STATE-CHANGING request we require the
 * `Origin` header's host to match the request `Host` header (both are the public
 * host the browser/proxy see, so this survives a reverse proxy that preserves
 * Host — the standard setup). An ABSENT Origin is allowed: non-browser clients
 * hit the API directly, and Lax already blocks cross-site form POSTs.
 *
 * Ops levers: `ALLOWED_ORIGINS` (comma-separated origins/hosts) whitelists extra
 * origins; `CSRF_ORIGIN_CHECK=off` is an emergency kill-switch if a proxy that
 * rewrites Host ever causes false positives.
 */
function isForbiddenCrossOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (process.env.CSRF_ORIGIN_CHECK === "off") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true; // malformed Origin on a write → reject
  }
  if (originHost === request.headers.get("host")) return false;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return !(allowed.includes(origin) || allowed.includes(originHost));
}

/**
 * The BFF proxy handlers, factored out of the admin app. Every client data call
 * goes to same-origin `/api/*` (no CORS) and is forwarded to the upstream API
 * with a server-side `Bearer` header; the browser never holds the API tokens.
 * Access tokens refresh transparently on 401, and the rotated tokens are
 * persisted onto this response.
 *
 * Wire it in `app/api/[...path]/route.ts`:
 *   export const { GET, POST, PUT, PATCH, DELETE } = createBffProxy(session);
 */
export function createBffProxy(session: ProxySession) {
  async function proxy(
    request: NextRequest,
    path: string[],
  ): Promise<NextResponse> {
    if (hasUnsafePathSegment(path ?? [])) {
      return new NextResponse("Invalid gateway path", { status: 400 });
    }

    if (isForbiddenCrossOrigin(request)) {
      return new NextResponse("Forbidden: cross-origin request rejected", {
        status: 403,
      });
    }

    const suffix = "/" + (path?.join("/") ?? "") + request.nextUrl.search;

    const hasBody = !["GET", "HEAD"].includes(request.method);
    // Forward a safelist of request headers (auth is added server-side via the
    // Bearer token, so the browser's cookies/host are intentionally dropped).
    const fwd = new Headers();
    for (const name of ["content-type", "accept", "cache-control", "pragma"]) {
      const value = request.headers.get(name);
      if (value) fwd.set(name, value);
    }
    const init: RequestInit = {
      method: request.method,
      headers: fwd,
      body: hasBody ? await request.arrayBuffer() : undefined,
    };

    const {
      res: upstream,
      refreshed,
      sessionDead,
    } = await session.apiFetch(suffix, init);

    // Stream the upstream response back, preserving content type/disposition.
    // Never forward upstream Set-Cookie — this app owns its own session cookies.
    const headers = new Headers();
    const ct = upstream.headers.get("content-type");
    const disposition = upstream.headers.get("content-disposition");
    if (ct) headers.set("content-type", ct);
    if (disposition) headers.set("content-disposition", disposition);

    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
    if (refreshed) session.attachSessionCookies(response, refreshed);
    // Session proven dead (refresh token rejected) → expire the cookies + marker
    // so the client's next read agrees it's a guest. A transient failure leaves
    // them untouched, so a valid session survives an API hiccup / redeploy.
    else if (sessionDead) session.clearSessionCookies?.(response);
    return response;
  }

  return {
    GET: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
    POST: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
    PUT: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
    PATCH: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
    DELETE: (req: NextRequest, { params }: RouteCtx) => proxy(req, params.path),
  };
}
