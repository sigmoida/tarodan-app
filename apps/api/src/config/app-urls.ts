/**
 * The two frontends' base URLs, resolved in ONE place.
 *
 * `FRONTEND_URL` was read at 30+ call sites across 16 files, each repeating its
 * own fallback — and the fallbacks had already drifted into seven variants of
 * the same value: the canonical domain, an environment-aware pair, a bare
 * `http://localhost:3000` (in the password-reset and verify-email links), an
 * `APP_URL` alias, a trailing-slash-stripped form, and PayTR's return URLs with
 * no fallback at all. A value that means one thing cannot be defined in seven
 * places; anything a caller genuinely needs to decide stays an explicit
 * argument, so a divergence is visible at the call site instead of hidden in a
 * repeated string literal.
 *
 * Plain functions rather than an injected service: `ConfigModule` copies parsed
 * `.env` values into `process.env` at boot, so both reads resolve the same
 * value, and this stays callable from schedulers, workers and pure helpers that
 * have no DI context.
 */
import { isProduction } from "./environment";

/** Public storefront origin. */
export const CANONICAL_FRONTEND_URL = "https://tarodan.com.tr";

/** Storefront origin while developing locally (`pnpm --filter @tarodan/web dev`). */
export const LOCAL_FRONTEND_URL = "http://localhost:3000";

const CANONICAL_ADMIN_URL = "https://admin.tarodan.com.tr";
const LOCAL_ADMIN_URL = "http://localhost:3002";

/**
 * Storefront base URL, falling back to `fallback` when `FRONTEND_URL` is unset
 * or empty. Pass a fallback only to preserve a link that is deliberately not
 * the canonical domain.
 */
export function frontendUrl(fallback: string = CANONICAL_FRONTEND_URL): string {
  return process.env.FRONTEND_URL || fallback;
}

/**
 * Storefront base URL for links rendered into e-mail: the canonical domain in
 * production, the local dev server anywhere else, so a developer's test mail
 * links back to their own machine instead of the live site.
 */
export function frontendUrlForEnvironment(): string {
  return frontendUrl(
    isProduction() ? CANONICAL_FRONTEND_URL : LOCAL_FRONTEND_URL,
  );
}

/**
 * Admin panel base URL, with any trailing slash removed so callers can append
 * a path directly. Unlike the storefront this has always been
 * environment-aware, and every call site agreed on that.
 */
export function adminUrl(): string {
  return (
    process.env.ADMIN_URL?.replace(/\/$/, "") ||
    (isProduction() ? CANONICAL_ADMIN_URL : LOCAL_ADMIN_URL)
  );
}
