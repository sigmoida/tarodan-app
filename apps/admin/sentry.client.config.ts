/**
 * Sentry Client Configuration for Admin Panel
 * This file configures Sentry for the browser
 */
import * as Sentry from "@sentry/nextjs";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";
import { scrubEvent } from "./sentry.scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: sentryTracesSampleRate,

  // Session replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Environment
  environment: sentryEnvironment,
  release: sentryRelease,

  // Tag as admin panel
  initialScope: {
    tags: {
      app: "admin",
    },
  },

  // Filter out noisy errors
  ignoreErrors: ["Network request failed", "Failed to fetch", "NetworkError"],

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  beforeSend: scrubEvent,
});
