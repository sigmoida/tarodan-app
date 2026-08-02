/**
 * Sentry Server Configuration
 * This file configures Sentry for the server-side (SSR)
 */
import * as Sentry from "@sentry/nextjs";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: sentryTracesSampleRate,

  // Environment
  environment: sentryEnvironment,
  release: sentryRelease,

  // Only enable in production or when DSN is set
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
});
