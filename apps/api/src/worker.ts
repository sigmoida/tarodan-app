/**
 * Worker Entry Point
 * Standalone worker process for background job processing
 */
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { WorkerModule } from "./workers";

/**
 * Initialize Sentry for the worker process (#71). The worker runs as a separate
 * process and does NOT import the API's SentryModule, so without this every
 * background-job error — and any uncaught exception in the worker — went
 * unreported. Mirrors the API's Sentry config (minus the HTTP integration,
 * which is irrelevant to a headless worker).
 */
function initWorkerSentry(logger: Logger): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn("Sentry DSN not configured — worker error tracking disabled");
    return false;
  }
  const environment = process.env.NODE_ENV || "development";
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === "production" ? 0.2 : 1.0,
  });
  logger.log("Sentry initialized (worker)");
  return true;
}

async function bootstrap() {
  const logger = new Logger("Worker");

  const sentryEnabled = initWorkerSentry(logger);

  // Surface otherwise-silent crashes to Sentry before the process dies.
  process.on("unhandledRejection", (reason) => {
    if (sentryEnabled) Sentry.captureException(reason);
    logger.error(
      "Unhandled promise rejection in worker",
      reason instanceof Error ? reason.stack : String(reason),
    );
  });
  process.on("uncaughtException", (err) => {
    if (sentryEnabled) Sentry.captureException(err);
    logger.error("Uncaught exception in worker", err.stack);
  });

  logger.log("Starting Tarodan Worker...");

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn", "log"],
  });

  logger.log("Worker started successfully");
  logger.log(
    "Listening for jobs on queues: email, push, image, payment, shipping, search",
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.log("Shutting down worker...");
    await app.close();
    // Flush any buffered Sentry events before exiting.
    if (sentryEnabled) await Sentry.close(2000);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap();
