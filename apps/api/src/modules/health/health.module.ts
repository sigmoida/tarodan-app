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
import { AdminTradeCommonService } from "../admin/admin-trade-common.service";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [HealthController],
  // AdminTradeCommonService leaf'tir (bağımlılığı yok): admin modülünü import
  // etmeden burada da provide edilir — depo readiness'ı takas onayıyla aynı
  // çözümleme mantığını paylaşır.
  providers: [HealthService, WorkerHeartbeatService, AdminTradeCommonService],
  exports: [HealthService],
})
export class HealthModule {}
