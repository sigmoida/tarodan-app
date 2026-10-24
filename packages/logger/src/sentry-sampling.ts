/**
 * Sentry sample rates by environment: the one table for the API (web and
 * worker roles), web and admin (client, server and edge). tarodan-mobile
 * cannot import this package; its `src/services/sentrySampling.ts` mirrors the
 * `mobileTracesSampleRate` column, so a change here is a change there too.
 *
 * Why by environment and not by `NODE_ENV`: every Dockerfile sets
 * `NODE_ENV=production`, so staging used to sample at production rates and
 * burn the trace and replay quota on test traffic. Staging keeps a small trace
 * sample so a slow path can still be looked at; replays there are off. Errors
 * are never sampled anywhere.
 *
 * Pure and dependency free on purpose: the browser bundles import it.
 * Pick the fields a runtime uses; do not spread the whole row into
 * `Sentry.init` (a server has no replay, and the mobile column is not a
 * Sentry option).
 */

/** The rows of the table. Any other environment reads as `development`. */
export type SentrySamplingEnvironment =
  "production" | "staging" | "development";

export interface SentrySampling {
  /** Error events (`sampleRate`): always 1, errors are never sampled. */
  readonly sampleRate: number;
  /** Traces for the API, web and admin (`tracesSampleRate`). */
  readonly tracesSampleRate: number;
  /** Traces for tarodan-mobile, which mirrors this value in its own repo. */
  readonly mobileTracesSampleRate: number;
  /** Browser session replay (`replaysSessionSampleRate`). */
  readonly replaysSessionSampleRate: number;
  /** Browser replay of a session that hit an error (`replaysOnErrorSampleRate`). */
  readonly replaysOnErrorSampleRate: number;
}

const SENTRY_SAMPLING: Readonly<
  Record<SentrySamplingEnvironment, SentrySampling>
> = Object.freeze({
  production: Object.freeze({
    sampleRate: 1,
    tracesSampleRate: 0.2,
    mobileTracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  }),
  staging: Object.freeze({
    sampleRate: 1,
    tracesSampleRate: 0.02,
    mobileTracesSampleRate: 0.02,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  }),
  development: Object.freeze({
    sampleRate: 1,
    tracesSampleRate: 0,
    mobileTracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  }),
});

/**
 * The table row for a Sentry `environment` tag. The tag is compared trimmed
 * and lower-cased (`Production` is production). Anything that is not
 * `production` or `staging` (`development`, `unknown`, a typo, missing) gets
 * the development row: a misconfigured build sends its errors but no traces
 * or replays, instead of spending the production quota.
 */
export function sentrySampling(
  environment: string | undefined,
): SentrySampling {
  const tag = environment?.trim().toLowerCase();
  if (tag === "production" || tag === "staging") return SENTRY_SAMPLING[tag];
  return SENTRY_SAMPLING.development;
}
