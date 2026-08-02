import {
  ConsoleSink,
  createLogger,
  type ConsoleFormat,
  type Logger,
} from "@tarodan/logger";
import type { SentryService } from "../../modules/sentry/sentry.service";
import { createSentryServiceSink } from "./sentry-service-sink";

let instance: Logger | null = null;

/**
 * Konsol biçimi `NODE_ENV`'e DEĞİL kendi anahtarına bağlıdır: prod'da JSON
 * basmak yalnız bir log toplayıcı (Loki/ELK) varsa işe yarar; toplayıcı
 * kurulana kadar tek okuyucu konteyner loglarını gözle tarayan operatördür ve
 * JSON onun için okunamaz. Toplayıcı eklendiği gün `LOG_FORMAT=json` yeter.
 */
function consoleFormat(): ConsoleFormat {
  return process.env.LOG_FORMAT === "json" ? "json" : "pretty";
}

/** Called once after SentryModule initializes (SentryService is injected). */
export function initAppLogger(sentry: SentryService): Logger {
  instance = createLogger({
    name: "api",
    sinks: [
      new ConsoleSink({ format: consoleFormat() }),
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
      sinks: [new ConsoleSink({ format: consoleFormat() })],
      minLevel: "info",
    });
  }
  return instance;
}
