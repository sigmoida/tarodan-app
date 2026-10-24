/**
 * Worker Entry Point
 * Standalone worker process for background job processing
 */
import { NestFactory } from "@nestjs/core";
import { INestApplicationContext, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { AppModule } from "./app.module";
import { AppNestLogger } from "./common/logging/nest-logger";
import { buildSentryNodeOptions } from "./modules/sentry/sentry-event";
import { errorStack } from "./common/helpers/error-message";

/**
 * Initializes Sentry for the worker process (#71) before Nest boots, so a
 * crash while the headless AppModule loads is reported too. The options are
 * the API's (`buildSentryNodeOptions`): same environment tag, sample rates
 * and privacy gates (the Sürat tracking polls run in this process and carry
 * credentials in their query string). `SentryModule`, loaded later with
 * AppModule, sees the client and does not initialize Sentry a second time.
 */
function initWorkerSentry(logger: Logger): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn("Sentry DSN not configured — worker error tracking disabled");
    return false;
  }
  Sentry.init(buildSentryNodeOptions(dsn));
  logger.log("Sentry initialized (worker)");
  return true;
}

async function bootstrap() {
  const logger = new Logger("Worker");

  const sentryEnabled = initWorkerSentry(logger);

  // Surface otherwise-silent crashes to Sentry before the process dies.
  process.on("unhandledRejection", (reason) => {
    if (sentryEnabled) Sentry.captureException(reason);
    logger.error("Unhandled promise rejection in worker", errorStack(reason));
  });
  process.on("uncaughtException", (err) => {
    if (sentryEnabled) Sentry.captureException(err);
    logger.error("Uncaught exception in worker", err.stack);
  });

  logger.log("Starting Tarodan Worker...");

  // The worker loads AppModule as a HEADLESS application context (no HTTP), so
  // both the classic queue workers (WorkerModule) and the `scheduled` queue
  // processors embedded in feature modules (outbox-drain, ledger-reconcile,
  // payout, membership, boost, ...) run in this separate process. The role
  // comes from the env: the worker service gets `PROCESS_ROLE=worker`
  // (WorkerModule still loads; it is not `web`).
  let app: INestApplicationContext;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: new AppNestLogger(),
    });
  } catch (err) {
    // Exit like main.ts does: a worker that failed to boot must not stay up
    // with no queues running, looking healthy to the orchestrator. Flush the
    // event first; the unhandledRejection listener would keep the process
    // alive and never flush it.
    logger.error("Worker failed to start", errorStack(err));
    if (sentryEnabled) {
      Sentry.captureException(err);
      await Sentry.close(2000);
    }
    process.exit(1);
  }

  logger.log(
    "Worker started successfully (headless AppModule application-context)",
  );
  logger.log(
    "Processing queues: email, push, image, payment, search, analytics, moderation + scheduled",
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
