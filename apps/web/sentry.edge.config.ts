/**
 * Sentry Edge Configuration
 * This file configures Sentry for edge runtime (middleware)
 */
import * as Sentry from "@sentry/nextjs";

import { sentryRelease } from "./sentry.release";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Environment
  environment: process.env.NODE_ENV,
  release: sentryRelease,

  // Only enable in production or when DSN is set
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
});
