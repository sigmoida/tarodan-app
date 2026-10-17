/**
 * Sentry for the edge runtime (middleware). Loaded by `register()` in
 * `src/instrumentation.ts`.
 */
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryTransaction } from "@tarodan/logger";

import {
  sentryEnvironment,
  sentryRelease,
  sentryTracesSampleRate,
} from "./sentry.release";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: sentryEnvironment,
  release: sentryRelease,
  initialScope: { tags: { app: "web" } },
  tracesSampleRate: sentryTracesSampleRate,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
});
