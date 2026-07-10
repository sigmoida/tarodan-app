/**
 * Worker Entry Point
 * Standalone worker process for background job processing
 */
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerAppModule } from "./workers/worker-app.module";
import { startWorkerHealth } from "./workers/worker-health";

async function bootstrap() {
  const logger = new Logger("Worker");

  logger.log("Starting Tarodan Worker...");

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ["error", "warn", "log"],
  });

  // API'den bağımsız izleme: heartbeat + /health (Docker healthcheck + curl).
  const stopHealth = startWorkerHealth(logger);

  logger.log("Worker started successfully");
  logger.log(
    "Consuming queues: email, push, image, payment, shipping, search, analytics, moderation + scheduled (cron)",
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.log("Shutting down worker...");
    await stopHealth();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap();
