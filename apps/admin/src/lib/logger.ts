import * as Sentry from "@sentry/nextjs";
import {
  ConsoleSink,
  createLogger,
  createSentrySink,
  type Logger,
  type SentryLike,
} from "@tarodan/logger";

export const logger: Logger = createLogger({
  name: "admin",
  sinks: [new ConsoleSink(), createSentrySink(Sentry as unknown as SentryLike)],
  minLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
});
