/**
 * Sentry for the admin browser bundle. `withSentryConfig` (see
 * `sentry.build.js`) injects this file into the client entry, so it runs only
 * in builds with a DSN.
 */
import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryEvent,
  scrubSentryTransaction,
  sentrySampling,
} from "@tarodan/logger";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

const replays = sentrySampling(sentryEnvironment);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: { tags: { app: "admin" } },

  tracesSampleRate: sentryTracesSampleRate,

  // Session replay rates from the shared table (production: errors only).
  replaysSessionSampleRate: replays.replaysSessionSampleRate,
  replaysOnErrorSampleRate: replays.replaysOnErrorSampleRate,

  ignoreErrors: ["Network request failed", "Failed to fetch", "NetworkError"],

  // Ids only: admin screens show IBANs, identity numbers and addresses, so
  // every event and transaction goes through the shared scrubber
  // (tarodan-ops: docs/observability.md).
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
