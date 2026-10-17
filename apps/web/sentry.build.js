const { withSentryConfig } = require("@sentry/nextjs");

/**
 * Build-time Sentry wiring for next.config.js: the only place that decides
 * whether the Sentry SDK is compiled in, which release the bundles carry and
 * whether source maps are uploaded. The runtime options (DSN, environment,
 * sampling, scrubbing) live in `sentry.release.ts` and `sentry.*.config.ts`.
 *
 * Keep in step with apps/admin/sentry.build.js (same file, other project).
 */

const SHORT_SHA_LENGTH = 7;
/** Coolify writes these when it has no real commit to give. */
const PLACEHOLDER_COMMITS = new Set(["unknown", "head"]);

/**
 * The release every bundle (client, server, edge) is tagged with. In order:
 * an explicit `NEXT_PUBLIC_SENTRY_RELEASE`, then Coolify's `SOURCE_COMMIT`
 * cut to the short sha (the API tags its events the same way, so one deploy
 * has one release across api, web and admin). Undefined when neither is
 * there: the SDK then falls back to the Next build id.
 */
function resolveSentryRelease(env) {
  const explicit = env.NEXT_PUBLIC_SENTRY_RELEASE?.trim();
  if (explicit) return explicit;
  const sha = env.SOURCE_COMMIT?.trim();
  if (!sha || PLACEHOLDER_COMMITS.has(sha.toLowerCase())) return undefined;
  return sha.slice(0, SHORT_SHA_LENGTH);
}

/**
 * Options for `withSentryConfig` (@sentry/nextjs 8.x). Source maps are
 * generated and uploaded only when an auth token is present; without one the
 * build skips them entirely instead of failing, and no `.map` file is ever
 * served from `/_next/static` (uploaded client maps are deleted).
 */
function sentryBuildOptions(env) {
  const release = resolveSentryRelease(env);
  const uploadSourceMaps = Boolean(env.SENTRY_AUTH_TOKEN);
  return {
    org: env.SENTRY_ORG,
    project: env.SENTRY_PROJECT,
    authToken: env.SENTRY_AUTH_TOKEN,
    silent: !uploadSourceMaps,
    telemetry: false,
    release: {
      name: release,
      create: uploadSourceMaps && Boolean(release),
      finalize: uploadSourceMaps && Boolean(release),
    },
    sourcemaps: {
      disable: !uploadSourceMaps,
      deleteSourcemapsAfterUpload: true,
    },
    widenClientFileUpload: true,
    disableLogger: true,
    unstable_sentryWebpackPluginOptions: {
      // An upload or release failure (bad token, unknown project, network)
      // must never fail the deploy: warn and keep the build.
      errorHandler: (err) => {
        // eslint-disable-next-line no-console
        console.warn("[sentry] source map upload skipped:", err && err.message);
      },
    },
  };
}

/**
 * Wraps the Next config when a DSN is configured; returns it untouched
 * otherwise, so local and CI builds without Sentry stay plain Next builds.
 * The resolved release is inlined as `NEXT_PUBLIC_SENTRY_RELEASE`, which
 * `sentry.release.ts` reads in every runtime.
 */
function withSentry(nextConfig, env) {
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return nextConfig;
  if (!env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sentry] NEXT_PUBLIC_SENTRY_ENVIRONMENT is not set; events will be tagged "unknown".',
    );
  }
  const release = resolveSentryRelease(env);
  const configWithRelease = release
    ? {
        ...nextConfig,
        env: { ...nextConfig.env, NEXT_PUBLIC_SENTRY_RELEASE: release },
      }
    : nextConfig;
  return withSentryConfig(configWithRelease, sentryBuildOptions(env));
}

module.exports = { resolveSentryRelease, sentryBuildOptions, withSentry };
