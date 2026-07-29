/**
 * Health Module
 * Provides health check endpoints for the API Gateway
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { PrismaModule } from "../../prisma";
import { WorkerHeartbeatService } from "./worker-heartbeat.service";
import { AuthModule } from "../auth";

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [HealthController],
  providers: [HealthService, WorkerHeartbeatService],
  exports: [HealthService],
})
export class HealthModule {}
