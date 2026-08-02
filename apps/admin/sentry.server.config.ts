/**
 * Sentry Server Configuration for Admin Panel
 */
import * as Sentry from "@sentry/nextjs";

import { sentryRelease } from "./sentry.release";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  environment: process.env.NODE_ENV,
  release: sentryRelease,
  initialScope: {
    tags: {
      app: "admin",
    },
  },
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
});
