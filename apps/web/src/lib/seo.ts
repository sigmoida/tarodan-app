import { routing } from "@/i18n/routing";

/**
 * Single source of truth for the site's indexing switch and canonical origin.
 *
 * The storefront ships `noindex` until launch. Flipping ONE env flag
 * (`NEXT_PUBLIC_ALLOW_INDEXING=true`) opens indexing everywhere at once —
 * `robots.ts`, the root `metadata.robots`, the `X-Robots-Tag` header in
 * `next.config.js`, and the presence of a sitemap all read this same gate, so
 * they can never drift out of sync (that triple-lock was issue #93).
 */

export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

/** Canonical public origin (no trailing slash). Used for sitemap + robots host. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://tarodan.com.tr"
).replace(/\/$/, "");

/**
 * Locale-prefixed path for `as-needed` routing: the default locale (tr) has no
 * prefix; others get `/<locale>` (e.g. `/en/contact`). `/` maps to `/en` (no
 * trailing slash) for non-default locales.
 */
export function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * Per-locale `alternates.canonical`. Without the locale prefix an `/en` page
 * would canonicalize to its tr URL, contradicting the sitemap hreflang
 * alternates (#254).
 */
export function localizedCanonical(locale: string, path: string) {
  return { canonical: localizedPath(locale, path) };
}
