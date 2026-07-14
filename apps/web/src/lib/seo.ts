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
  process.env.NEXT_PUBLIC_APP_URL || "https://tarodan.com"
).replace(/\/$/, "");
