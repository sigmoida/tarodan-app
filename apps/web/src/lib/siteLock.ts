/**
 * Pre-launch storefront gate (#398). When `SITE_LOCKED=true` is set on the
 * prod Coolify web app, the middleware rewrites every request to
 * `/coming-soon` unless the visitor carries a `site_unlock` cookie whose value
 * matches the hash of `SITE_UNLOCK_PIN`. Both the middleware (edge runtime)
 * and the `/api/unlock` route handler (node runtime) derive the cookie value
 * from the same helper so the PIN itself is never stored in the cookie and
 * never reaches the client bundle.
 */

export const SITE_UNLOCK_COOKIE = "site_unlock";

const TOKEN_NAMESPACE = "tarodan.site-unlock.v1:";

const encoder = new TextEncoder();

/**
 * Derive the opaque unlock token from the shared PIN. Uses SHA-256 via
 * `crypto.subtle` — available on both the edge runtime (middleware) and the
 * node runtime (route handler), no `node:crypto` polyfill needed.
 */
export async function siteUnlockToken(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(TOKEN_NAMESPACE + pin),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Timing-safe string comparison (both strings are same-length hex here). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
