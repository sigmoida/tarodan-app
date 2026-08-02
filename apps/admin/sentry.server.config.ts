/**
 * Sentry Server Configuration for Admin Panel
 */
import * as Sentry from "@sentry/nextjs";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: sentryTracesSampleRate,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: {
    tags: {
      app: "admin",
    },
  },
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
});
