import * as Sentry from "@sentry/nextjs";

import { sentryServerDsn } from "../sentry.release";

/**
 * Next.js instrumentation hook: the only place the server and edge Sentry
 * SDKs are initialised (@sentry/nextjs 8 no longer loads
 * `sentry.server.config.ts` / `sentry.edge.config.ts` by itself). The
 * options stay in those files; this only picks the one for the runtime.
 */
export async function register() {
  // No DSN, no SDK: an init with `enabled: false` would still set up
  // OpenTelemetry and patch the runtime for nothing (local dev, CI).
  if (!sentryServerDsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/** Reports errors from Server Components, route handlers and middleware. */
export const onRequestError = Sentry.captureRequestError;
