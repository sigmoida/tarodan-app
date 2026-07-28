import type { Breadcrumb, LogEntry, LogUser, Sink } from "@tarodan/logger";
import type { SentryService } from "../../modules/sentry/sentry.service";
import { redactSensitive } from "../security/redact-sensitive";

const LEVEL_MAP: Record<
  string,
  "fatal" | "error" | "warning" | "info" | "debug"
> = {
  debug: "debug",
  info: "info",
  warn: "warning",
  error: "error",
};

/** Adapts SentryService (injectable) to the @tarodan/logger Sink interface. */
export function createSentryServiceSink(sentry: SentryService): Sink {
  return {
    // Console output handled by ConsoleSink; log() is a no-op here.
    log: (_entry: LogEntry) => {},
    captureException: (err: unknown, ctx?: Record<string, unknown>) => {
      const error = err instanceof Error ? err : new Error(String(err));
      sentry.captureException(
        error,
        redactSensitive(ctx) as Record<string, unknown> | undefined,
      );
    },
    setUser: (user: LogUser | null) => {
      if (user) sentry.setUser(user);
      else sentry.clearUser();
    },
    addBreadcrumb: (bc: Breadcrumb) => {
      sentry.addBreadcrumb({
        category: bc.category,
        message: bc.message,
        level: bc.level ? LEVEL_MAP[bc.level] : undefined,
        data: redactSensitive(bc.data) as Record<string, unknown> | undefined,
      });
    },
  };
}
