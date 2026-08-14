/**
 * Runtime mode predicates.
 *
 * `NODE_ENV` is not application configuration — it is the mode the process was
 * started in, needed before the DI container exists (module-level constants,
 * conditional module registration). It is therefore read from `process.env`
 * here rather than through `ConfigService`, and every other file asks these
 * predicates instead of re-comparing the string: a typo in one of ~25 scattered
 * `=== "production"` checks silently disables whatever it guards.
 */

/** Deployed production. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
