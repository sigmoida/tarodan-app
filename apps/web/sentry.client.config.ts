/**
 * Sentry Client Configuration
 * This file configures Sentry for the browser
 */
import * as Sentry from "@sentry/nextjs";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: sentryTracesSampleRate,

  // Session replay (captures user sessions for debugging)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Environment
  environment: sentryEnvironment,
  release: sentryRelease,

  // Filter out noisy errors
  ignoreErrors: [
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "NetworkError",
    // Browser extensions
    /^chrome-extension:/,
    /^moz-extension:/,
  ],

  // Only enable in production or when DSN is set
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Attach user context
  beforeSend(event) {
    // Remove sensitive data
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      if (data.password) data.password = "[REDACTED]";
      if (data.token) data.token = "[REDACTED]";
    }
    return event;
  },
});
