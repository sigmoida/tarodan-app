import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { AdminTestToolsController } from "./admin-test-tools.controller";
import { AdminTestToolsService } from "./admin-test-tools.service";
import { TestLaneService } from "./test-lane.service";
import { ShipmentSimulationService } from "./shipment-simulation.service";
import { AuthModule } from "../auth/auth.module";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { QUEUE_NAMES } from "../../workers/constants";

/**
 * Admin Test Araçları modülü. Cron tetikleme `scheduled` kuyruğuna fiş atar —
 * feature modüllerine doğrudan bağımlılık YOK (iş, kayıtlı @Process işleyicide
 * koşar). AuthModule guard'lar (AdminJwtAuthGuard/RolesGuard) için.
 *
 * Tek istisna SuratCargoModule: kargo simülasyonu okumayı gerçek takip
 * senkronunun çekirdeğine (`SuratTrackingService`) verir — kendi statü yazımı
 * yoktur. SuratCargoModule yaprak modüldür; döngü oluşturmaz.
 */
@Module({
  imports: [
    AuthModule,
    SuratCargoModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [AdminTestToolsController],
  providers: [
    AdminTestToolsService,
    TestLaneService,
    ShipmentSimulationService,
  ],
})
export class AdminTestToolsModule {}
