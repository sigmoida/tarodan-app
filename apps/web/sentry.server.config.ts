/**
 * Sentry for the Node.js server runtime (SSR, route handlers, server
 * actions). Loaded by `register()` in `src/instrumentation.ts`.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "@tarodan/logger";

import {
  sentryEnvironment,
  sentryRelease,
  sentryServerDsn,
  sentryTracesSampleRate,
} from "./sentry.release";

Sentry.init({
  dsn: sentryServerDsn,
  enabled: !!sentryServerDsn,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: { tags: { app: "web" } },
  tracesSampleRate: sentryTracesSampleRate,
  // The failing request's cookies are the session tokens (`web_at`/`web_rt`):
  // the scrubber drops them along with every other PII field.
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
