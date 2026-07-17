import { ConsoleSink, createLogger, type Logger } from "@tarodan/logger";
import type { SentryService } from "../../modules/sentry/sentry.service";
import { createSentryServiceSink } from "./sentry-service-sink";

let instance: Logger | null = null;

/** Called once after SentryModule initializes (SentryService is injected). */
export function initAppLogger(sentry: SentryService): Logger {
  instance = createLogger({
    name: "api",
    sinks: [
      new ConsoleSink({ json: process.env.NODE_ENV === "production" }),
      createSentryServiceSink(sentry),
    ],
    minLevel: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
  });
  return instance;
}

/** Returns a console-only fallback logger if not yet initialized (init-order independent). */
export function getAppLogger(): Logger {
  if (!instance) {
    instance = createLogger({
      name: "api",
      sinks: [new ConsoleSink()],
      minLevel: "info",
    });
  }
  return instance;
}
