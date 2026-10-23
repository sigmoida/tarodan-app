/**
 * Sentry for the admin browser bundle. `withSentryConfig` (see
 * `sentry.build.js`) injects this file into the client entry, so it runs only
 * in builds with a DSN.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "@tarodan/logger";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: { tags: { app: "admin" } },

  tracesSampleRate: sentryTracesSampleRate,

  // Session replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  ignoreErrors: ["Network request failed", "Failed to fetch", "NetworkError"],

  // Ids only: admin screens show IBANs, identity numbers and addresses, so
  // every event and transaction goes through the shared scrubber
  // (tarodan-ops: docs/observability.md).
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
