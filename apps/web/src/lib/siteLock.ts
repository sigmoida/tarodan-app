/**
 * Pre-launch storefront gate (#398). When `SITE_LOCKED=true` is set on the
 * prod Coolify web app, the middleware rewrites every request to
 * `/coming-soon` unless the visitor carries a valid signed `site_unlock`
 * cookie (see `siteUnlockCookie.mjs`). Access codes are admin-managed rows in
 * the API DB; the `/api/unlock` route verifies a submitted code against the
 * API (or the optional `SITE_UNLOCK_PIN` emergency fallback) and issues the
 * cookie signed with `SITE_UNLOCK_SECRET`.
 */

export const SITE_UNLOCK_COOKIE = "site_unlock";

/** Timing-safe string comparison (both strings are same-length here). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
