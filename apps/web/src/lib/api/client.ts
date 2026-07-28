/** @format */

import { createApiClient, type AxiosError } from "@tarodan/api-client";
import { hasAuthMarker } from "@/lib/authMarker";
import { getPublicApiOrigin } from "./origin";

// Browser → same-origin gateway proxy (`/gateway`): the proxy adds the `Bearer`
// token server-side from the Next-owned `web_at` cookie and refreshes it on 401,
// so the browser never holds an API token. Public/guest calls work through the
// same hop (no cookie → no Bearer). A separate namespace from `/api/*` on purpose
// — the existing `/api/:path*` and `/api/payment/callback/*` (PayTR) rewrites
// must keep working untouched. Public SSR fetches use the absolute API directly
// (not this client); server-side axios (rare) also goes direct.
const API_ORIGIN = getPublicApiOrigin();
const baseURL =
  typeof window !== "undefined" ? "/gateway" : `${API_ORIGIN}/api`;

export const api = createApiClient({
  baseURL,
  // Auth artık httpOnly cookie'lerde; her istekte cookie gönderilsin. Authorization header eklemiyoruz.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  onResponseError: handleApiError,
});

/** Checkout / ödeme sırasında 401'de token silmek PayTR dönüşü veya /payments/status çağrısını kırar. */
function shouldPreserveAuthTokenOn401(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location?.pathname || "";
  return (
    p === "/checkout" ||
    p.endsWith("/checkout") ||
    p.includes("/cart") ||
    p.includes("/payment")
  );
}

/**
 * Genuinely private pages — a session that expires while the user is on one
 * should bounce to login. The whole account area lives under `/profile/*`
 * (orders, messages, favorites, notifications, …); the owner-only edit flows are
 * the other private surfaces. Kept in sync with the middleware matcher; public /
 * SEO pages are deliberately absent so a stray 401 there doesn't eject the user.
 */
function isProtectedPath(path: string): boolean {
  if (path.startsWith("/profile")) return true;
  return /^\/(listings|collections)\/[^/]+\/edit$/.test(path);
}

async function handleApiError(error: AxiosError) {
  // Banlı kullanıcı: backend BannedUserGuard tüm istekleri 403 + USER_BANNED
  // ile bloklar. Kullanıcıyı /banned sayfasına yönlendir (zaten oradaysa dokunma).
  const errData = error.response?.data as
    { errorCode?: string; bannedReason?: string } | undefined;
  if (
    error.response?.status === 403 &&
    errData?.errorCode === "USER_BANNED" &&
    typeof window !== "undefined" &&
    window.location?.pathname !== "/banned" &&
    window.location?.pathname !== "/contact"
  ) {
    const reason = errData.bannedReason
      ? `?reason=${encodeURIComponent(errData.bannedReason)}`
      : "";
    window.location.href = `/banned${reason}`;
    return Promise.reject(error);
  }

  // 401 handling — NOTE the deliberate divergence from admin
  // (`apps/admin/src/lib/api/client.ts`). Admin, which has NO session marker,
  // RETRIES a 401 up to 2× (300ms backoff) to ride out refresh-token rotation
  // before ejecting. Web instead trusts the SERVER-OWNED `tarodan_authed`
  // marker, which is the more principled signal: the proxy only clears it on a
  // genuinely dead session, so a transient 401 needs no client retry. This
  // marker-authority model is the intended long-term standard for both apps;
  // admin can adopt it once it is given an indicator cookie of its own.
  //
  // The BFF proxy attempts a server-side refresh first and OWNS the JS-readable
  // `tarodan_authed` marker: on a genuinely dead session
  // (refresh token rejected) it expires the marker, and that Set-Cookie is
  // applied by the browser before this handler runs; a transient refresh
  // failure (API redeploy / 5xx / network) leaves the marker intact. So the
  // marker's ABSENCE is now the authoritative "session is really gone" signal.
  //
  // The client NEVER clears the marker itself anymore — the old behaviour
  // nuked it on ANY stray 401 (a background poll, a non-auth 401), ejecting
  // users whose session was still alive (the "shows Giriş Yap but I'm logged
  // in" desync). We only react when the server has already declared it dead.
  if (error.response?.status === 401 && typeof window !== "undefined") {
    const sessionGone = !hasAuthMarker();
    if (sessionGone && !shouldPreserveAuthTokenOn401()) {
      const currentPath = window.location?.pathname || "";
      const publicPathsNoRedirect = [
        "/track-order",
        "/profile/orders/track",
        "/login",
        "/register",
      ];
      const isPublicPath = publicPathsNoRedirect.some(
        (p) => currentPath === p || currentPath.startsWith(p + "/"),
      );
      if (!isPublicPath && isProtectedPath(currentPath)) {
        window.location.href = "/login?expired=true";
      }
    }
  }
  return Promise.reject(error);
}

export default api;
