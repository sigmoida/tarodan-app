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
import { AdminTradeCommonService } from "../admin/trade/admin-trade-common.service";
import { WarehouseAddressModule } from "../shipping/warehouse/warehouse-address.module";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    // AdminTradeCommonService'in tek bağımlılığı (aşağıdaki nota bak).
    WarehouseAddressModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [HealthController],
  // AdminTradeCommonService yalnız WarehouseAddressService'e bağlıdır: admin
  // modülünü import etmeden burada da provide edilir — depo readiness'ı takas
  // onayıyla aynı çözümleme mantığını paylaşır.
  providers: [HealthService, WorkerHeartbeatService, AdminTradeCommonService],
  exports: [HealthService],
})
export class HealthModule {}
