/**
 * A valid bcrypt hash of an arbitrary fixed string, compared against on the
 * paths that reject before reaching a real password check — "no such user",
 * deleted account, social-only account, "no such email" on password reset.
 *
 * Without it those paths return near-instantly while a genuine wrong-password
 * rejection pays the full bcrypt cost, and the gap alone lets an attacker
 * enumerate registered emails by response time — the per-IP rate limit does
 * not close it.
 *
 * It lives here rather than in either service because login and password reset
 * both pad against it; two copies would let one drift to a different cost
 * factor and quietly reopen the gap on that path.
 */
export const DUMMY_BCRYPT_HASH =
  "$2b$10$QSpFWY/fQ/6ryufwK.uXDewqz1TIfVpj1w.Ik4Qf6YoOKI1jKIAg2";
