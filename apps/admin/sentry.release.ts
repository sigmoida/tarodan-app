/**
 * Shared Sentry runtime values: the single source for the client, server and
 * edge configs, so the three cannot drift.
 *
 * The `NEXT_PUBLIC_` prefix is required: the values are inlined into the
 * bundles AT BUILD TIME, so they must be Coolify build variables; a runtime
 * env alone is not enough. `NEXT_PUBLIC_SENTRY_RELEASE` is resolved by
 * `sentry.build.js` (explicit value, else Coolify's `SOURCE_COMMIT`).
 */

/**
 * The deploy release. Without it "which deploy brought this error" has no
 * answer and Sentry's regression tracking does not work. The Docker image has
 * no `.git`, so the SDK cannot guess it.
 */
export const sentryRelease =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined;

/**
 * The environment tag (`production`, `staging`). Never derived from
 * `NODE_ENV`: the Dockerfile sets it to `production` on staging too, so
 * staging test errors would mix into production alerts
 * (tarodan-ops: docs/observability.md). Unset reads as "unknown" on purpose,
 * so a misconfigured build is visible in Sentry instead of posing as one.
 */
export const sentryEnvironment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || "unknown";

/**
 * The sample rate follows the real build mode, not the tag: staging is a
 * production build too, and full sampling there would burn the trace quota.
 */
export const sentryTracesSampleRate =
  process.env.NODE_ENV === "production" ? 0.2 : 1.0;
