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
import { replaySampleRates } from "./src/lib/replayPolicy.mjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: sentryTracesSampleRate,

  // Session replay (captures user sessions for debugging). Kart sayfasına
  // DOĞRUDAN girilirse oranlar 0'dır → replay hiç kurulmaz (PCI DSS 6.4.3:
  // ödeme sayfasındaki script yüzeyini gerekçelendirilebilir tut). SPA ile
  // sonradan girişte PaymentReplayGuard çalışan kaydı durdurur.
  ...replaySampleRates(
    typeof window === "undefined" ? undefined : window.location.pathname,
  ),

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
