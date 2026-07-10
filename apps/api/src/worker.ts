/**
 * Worker Entry Point
 * Standalone worker process for background job processing
 */
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerAppModule } from "./workers/worker-app.module";

async function bootstrap() {
  const logger = new Logger("Worker");

  logger.log("Starting Tarodan Worker...");

  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    logger: ["error", "warn", "log"],
  });

  logger.log("Worker started successfully");
  logger.log(
    "Consuming queues: email, push, image, payment, shipping, search, analytics, moderation + scheduled (cron)",
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.log("Shutting down worker...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap();
