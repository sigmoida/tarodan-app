import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { AdminTestToolsController } from "./admin-test-tools.controller";
import { AdminTestToolsService } from "./admin-test-tools.service";
import { AuthModule } from "../auth/auth.module";
import { QUEUE_NAMES } from "../../workers/constants";

/**
 * Admin Test Araçları modülü. Cron tetikleme `scheduled` kuyruğuna fiş atar —
 * feature modüllerine doğrudan bağımlılık YOK (iş, kayıtlı @Process işleyicide
 * koşar). AuthModule guard'lar (AdminJwtAuthGuard/RolesGuard) için.
 */
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [AdminTestToolsController],
  providers: [AdminTestToolsService],
})
export class AdminTestToolsModule {}
