/**
 * Shared Sentry runtime values: the single source for the client, server and
 * edge configs, so the three cannot drift.
 *
 * The `NEXT_PUBLIC_` prefix is required: the values are inlined into the
 * bundles AT BUILD TIME, so they must be Coolify build variables; a runtime
 * env alone is not enough. `NEXT_PUBLIC_SENTRY_RELEASE` is resolved by
 * `sentry.build.js` (explicit value, else Coolify's `SOURCE_COMMIT`).
 */

import { sentrySampling } from "@tarodan/logger";

import { resolveSentryEnvironment } from "./src/lib/sentryEnvironment";

/**
 * DSN for the server and edge runtimes. A runtime `SENTRY_DSN` wins over the
 * build-time public one, so the server side can be repointed without a
 * rebuild. Undefined means no Sentry at all (see `src/instrumentation.ts`).
 */
export const sentryServerDsn =
  process.env.SENTRY_DSN?.trim() ||
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
  undefined;

/**
 * The deploy release. Without it "which deploy brought this error" has no
 * answer and Sentry's regression tracking does not work. The Docker image has
 * no `.git`, so the SDK cannot guess it.
 */
export const sentryRelease =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined;

/**
 * The environment tag (`production`, `staging`): the explicit build variable,
 * else derived from the app URL host (see `resolveSentryEnvironment`). Never
 * from `NODE_ENV` (tarodan-ops: docs/observability.md).
 */
export const sentryEnvironment = resolveSentryEnvironment(
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  process.env.NEXT_PUBLIC_APP_URL,
);

/**
 * Trace sample rate by Sentry environment (production 0.2, staging 0.02,
 * development 0), from the shared table in `@tarodan/logger`. Keyed on the
 * resolved tag, never `NODE_ENV`: staging is a production build too.
 */
export const sentryTracesSampleRate =
  sentrySampling(sentryEnvironment).tracesSampleRate;
