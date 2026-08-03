import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createAuthMiddleware } from "@tarodan/auth/middleware";
import { defaultLocale, locales } from "@tarodan/i18n";
import { webAuthConfig } from "@/lib/auth.config";
import { routing } from "@/i18n/routing";
import { SITE_UNLOCK_COOKIE } from "@/lib/siteLock";
import { internalComingSoonPath, isSiteLocked } from "@/lib/siteLockPolicy.mjs";
import { verifyUnlockCookie } from "@/lib/siteUnlockCookie.mjs";
import {
  buildContentSecurityPolicy,
  cspHeaderName,
  isPaymentPath,
  safeOrigin,
  sentryIngestOrigin,
  sentryReportUri,
} from "@/lib/cspPolicy.mjs";

/**
 * Web middleware = i18n routing (#214) composed with the edge auth gate.
 *
 * TWO jobs run on every page request:
 *
 *  1. **i18n routing** (`next-intl`): resolve the locale from the URL — `/en/…`
 *     → `en`, prefix-free → the default `tr` — and rewrite to the internal
 *     `[locale]` segment (+ maintain the `NEXT_LOCALE` cookie). This is what
 *     makes SSR/SSG render in the right language and `<html lang>` correct.
 *
 *  2. **auth gate** (`@tarodan/auth`, shared with admin): on the private area,
 *     bounce guests to `/login` and proactively refresh an expired access token.
 *
 * Composition is delicate because the auth engine reads `request.nextUrl.pathname`
 * itself and treats every NON-public path it sees as protected. So we DON'T hand
 * it every URL — we replicate the old matcher as `isAuthRelevant()` and only
 * invoke it for those paths, feeding it the **locale-stripped** path (`/en/profile`
 * → `/profile`) so its patterns match and any redirect it builds is prefix-free.
 * We then re-add the visitor's prefix to that redirect so an English user stays
 * in English. For allowed requests we run the i18n middleware and copy over any
 * cookies the auth gate rotated (fresh access/refresh + the JS indicator).
 *
 * Known tradeoff: on the rare "access expired, refresh valid" navigation the auth
 * gate rotates the token onto BOTH the response (browser — preserved here) and
 * the in-flight request headers (so the same request's RSC sees it). We keep the
 * former; the latter is dropped because the final response is the i18n rewrite.
 * Effect is a single stale-token render that self-heals next navigation — the
 * session stays valid. (Admin composes no i18n, so it keeps both.)
 */

const intlMiddleware = createIntlMiddleware(routing);

const authMiddleware = createAuthMiddleware(webAuthConfig, {
  publicPaths: [],
  guestOnlyPaths: [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ],
});

/** Split a leading locale prefix off the path. Prefix-free ⇒ the default locale. */
function splitLocale(pathname: string): { locale: string; rest: string } {
  const seg = pathname.split("/")[1];
  if ((locales as readonly string[]).includes(seg)) {
    return { locale: seg, rest: pathname.slice(seg.length + 1) || "/" };
  }
  return { locale: defaultLocale, rest: pathname };
}

/**
 * The exact set of paths the old auth matcher covered (now tested against the
 * locale-stripped path). Keep in sync with the account area: the `/profile`,
 * `/seller`, `/products`, `/support` trees; the owner-only edit flows; the
 * standalone authed pages; and the guest-only auth pages.
 */
function isAuthRelevant(path: string): boolean {
  if (/^\/(profile|seller|products)(\/|$)/.test(path)) return true;
  // `/support` yardım içeriğini de barındırdığı için (eski /help ile birleşti)
  // kök sayfa herkese açıktır; giriş gerektiren kısmı sayfa içinde kendi
  // kartıyla anlatır. Talep DETAYI (`/support/<id>`) korumalı kalır.
  if (/^\/support\/.+/.test(path)) return true;
  if (
    /^\/(login|register|forgot-password|reset-password|verify-email)(\/|$)/.test(
      path,
    )
  )
    return true;
  if (
    path === "/wishlist" ||
    path === "/collections/liked" ||
    path === "/listings/new" ||
    path === "/membership/checkout"
  )
    return true;
  if (/^\/listings\/[^/]+\/edit$/.test(path)) return true;
  if (/^\/collections\/[^/]+\/edit$/.test(path)) return true;
  return false;
}

/** Re-add the visitor's locale prefix to a same-origin, prefix-free redirect. */
function reprefixRedirect(
  location: string,
  request: NextRequest,
  prefix: string,
): string {
  const dest = new URL(location, request.url);
  if (dest.origin !== request.nextUrl.origin) return location;
  if (splitLocale(dest.pathname).locale !== defaultLocale) return location;
  dest.pathname = prefix + (dest.pathname === "/" ? "" : dest.pathname);
  return dest.toString();
}

/**
 * İstek başına nonce + CSP. Nonce'u İSTEK başlıklarına da yazarız: Next, RSC
 * render'ında `content-security-policy` (veya report-only) başlığını okuyup
 * kendi satır içi hidrasyon script'lerine bu nonce'u basar
 * (`get-script-nonce-from-header`). Başlığı yalnız yanıta koymak, Next'in
 * script'lerinin nonce'suz kalması ve zorlayıcı modda bloklanması demekti.
 *
 * İstek başlıklarını KOPYALAMAK yerine yerinde set ediyoruz: next-intl kendi
 * rewrite'ında `request.headers`'ı aynen aşağı taşır (locale başlığını da böyle
 * geçirir), bu yüzden mutasyon downstream'e ulaşır. Request'i klonlamak POST
 * gövdeli isteklerde (server action) gövde akışını riske atardı.
 */
function applyCsp(request: NextRequest, isPayment: boolean): string {
  const nonce = btoa(crypto.randomUUID());
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const policy = buildContentSecurityPolicy({
    nonce,
    isPayment,
    isProduction: process.env.NODE_ENV === "production",
    apiOrigin: safeOrigin(process.env.NEXT_PUBLIC_API_URL),
    wsOrigin: safeOrigin(process.env.NEXT_PUBLIC_WS_URL),
    sentryOrigin: sentryIngestOrigin(dsn),
    reportUri: sentryReportUri(dsn),
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set(cspHeaderName(isPayment), policy);
  return policy;
}

export async function middleware(request: NextRequest) {
  const original = request.nextUrl.pathname;
  const { locale, rest } = splitLocale(original);
  const prefix = locale === defaultLocale ? "" : `/${locale}`;

  // Kart alanları BİZİM sayfamızda toplanıp doğrudan PayTR'ye POST edildiği için
  // ödeme rotası PCI DSS 6.4.3/11.6.1 kapsamındadır: orada politika ZORLAYICI,
  // sitenin geri kalanında salt-rapor (ihlal envanteri gerçek trafikle toplanır).
  const isPayment = isPaymentPath(rest);
  const csp = applyCsp(request, isPayment);
  const cspHeader = cspHeaderName(isPayment);
  /** Politika middleware'in HER çıkışında yanıta binmeli — tek yerden. */
  const withCsp = <T extends NextResponse>(response: T): T => {
    response.headers.set(cspHeader, csp);
    return response;
  };

  // Pre-launch storefront gate (#398). Runs BEFORE the i18n/auth flow so we
  // can short-circuit every page for locked deployments. The API/proxy/static
  // matchers already filter out `/api/unlock` and asset paths, so we only need
  // to allowlist `/coming-soon` here to avoid a rewrite loop.
  if (
    isSiteLocked(process.env.SITE_LOCKED) &&
    rest !== "/coming-soon" &&
    !rest.startsWith("/coming-soon/")
  ) {
    const secret = process.env.SITE_UNLOCK_SECRET;
    const cookieValue = request.cookies.get(SITE_UNLOCK_COOKIE)?.value;
    let unlocked = false;
    if (secret && cookieValue) {
      unlocked = await verifyUnlockCookie(
        secret,
        cookieValue,
        Math.floor(Date.now() / 1000),
      );
    }
    if (!unlocked) {
      const destination = request.nextUrl.clone();
      destination.pathname = internalComingSoonPath(locale);
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("X-NEXT-INTL-LOCALE", locale);
      const response = NextResponse.rewrite(destination, {
        request: { headers: requestHeaders },
      });
      response.headers.set("X-Robots-Tag", "noindex");
      return withCsp(response);
    }
  }

  let authResponse = null;
  if (isAuthRelevant(rest)) {
    // Feed the auth gate the prefix-free path so its matchers + redirects match.
    request.nextUrl.pathname = rest;
    authResponse = await authMiddleware(request);
    request.nextUrl.pathname = original;

    const location = authResponse.headers.get("location");
    if (location) {
      if (prefix) {
        authResponse.headers.set(
          "location",
          reprefixRedirect(location, request, prefix),
        );
      }
      return withCsp(authResponse);
    }
  }

  const response = intlMiddleware(request);
  if (authResponse) {
    for (const cookie of authResponse.cookies.getAll()) {
      response.cookies.set(cookie);
    }
  }
  return withCsp(response);
}

export const config = {
  // Run on every page, but never on API/proxy routes, Next internals, or files
  // with an extension (favicon.ico, images, etc.). `/` is included.
  matcher: ["/((?!api|gateway|_next|_vercel|.*\\..*).*)"],
};
