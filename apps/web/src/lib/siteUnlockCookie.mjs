/**
 * Signed site-unlock cookie (v2) for the pre-launch storefront gate.
 *
 * Unlock codes are admin-managed rows in the API DB, so the middleware can no
 * longer re-derive the cookie from a single shared PIN. Instead the unlock
 * route issues an HMAC-signed, expiring token and the middleware verifies it
 * locally — no per-request API call. Pure `.mjs` + Web Crypto so it runs on
 * both the edge runtime and under `node --test`.
 *
 * Cookie value format: `v2.<expEpochSeconds>.<hexHmacSha256>`
 * Signature input:     `tarodan.site-unlock.v2:<expEpochSeconds>`
 */

const TOKEN_NAMESPACE = "tarodan.site-unlock.v2:";
const VERSION = "v2";

export const UNLOCK_COOKIE_MAX_AGE_SECONDS = 10 * 24 * 60 * 60; // 10 days

const encoder = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Timing-safe comparison for same-purpose hex strings. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Issue a cookie value that expires at `expEpochSeconds`. */
export async function signUnlockCookie(secret, expEpochSeconds) {
  const exp = Math.floor(expEpochSeconds);
  const signature = await hmacHex(secret, TOKEN_NAMESPACE + exp);
  return `${VERSION}.${exp}.${signature}`;
}

/** Verify a cookie value: structure, expiry, then constant-time signature. */
export async function verifyUnlockCookie(secret, value, nowEpochSeconds) {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [, expRaw, signature] = parts;
  if (!/^\d{1,12}$/.test(expRaw)) return false;
  if (Number(expRaw) <= nowEpochSeconds) return false;
  const expected = await hmacHex(secret, TOKEN_NAMESPACE + Number(expRaw));
  return safeEqual(signature, expected);
}
