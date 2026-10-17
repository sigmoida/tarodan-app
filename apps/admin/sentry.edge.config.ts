/**
 * Sentry for the edge runtime (middleware). Loaded by `register()` in
 * `src/instrumentation.ts`.
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
  initialScope: { tags: { app: "admin" } },
  tracesSampleRate: sentryTracesSampleRate,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
