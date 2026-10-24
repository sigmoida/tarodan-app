/**
 * Sentry for the browser. `withSentryConfig` (see `sentry.build.js`) injects
 * this file into the client entry, so it runs only in builds with a DSN.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "@tarodan/logger";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";
import { replaySampleRates } from "./src/lib/replayPolicy.mjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: { tags: { app: "web" } },

  tracesSampleRate: sentryTracesSampleRate,

  // Session Replay sample rates. A DIRECT visit to the card page gets 0, so
  // replay is never set up there (PCI DSS 6.4.3: keep the payment page script
  // surface justifiable); after an SPA navigation PaymentReplayGuard stops a
  // running recording. See docs/PCI_PAYMENT_PAGE.md.
  ...replaySampleRates(
    typeof window === "undefined" ? undefined : window.location.pathname,
    sentryEnvironment,
  ),

  ignoreErrors: [
    // Network errors
    "Network request failed",
    "Failed to fetch",
    "NetworkError",
    // Browser extensions
    /^chrome-extension:/,
    /^moz-extension:/,
  ],

  // Ids only: no IP, cookies or user e-mail; every event and transaction
  // goes through the shared scrubber (tarodan-ops: docs/observability.md).
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
