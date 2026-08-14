/**
 * Runtime mode predicates.
 *
 * `NODE_ENV` is not application configuration — it is the mode the process was
 * started in, needed before the DI container exists (module-level constants,
 * conditional module registration, the bootstrap in `main.ts`). It is therefore
 * read from `process.env` here rather than through `ConfigService`, and the
 * rest of the app asks these predicates instead of re-comparing the string.
 *
 * The comparison was spelled out at ~25 call sites, and several of them guard
 * something that must not fail open: a payment bypass, a health check that
 * short-circuits outside production, a test-only controller. One typo in one of
 * those literals disables the guard silently — a predicate cannot be mistyped
 * without the compiler saying so.
 */

/** Deployed production. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Automated test run (jest unit, integration or e2e). */
export function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

/** Local development. */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** The raw mode string, for logs and diagnostics that report it verbatim. */
export function nodeEnv(): string | undefined {
  return process.env.NODE_ENV;
}
