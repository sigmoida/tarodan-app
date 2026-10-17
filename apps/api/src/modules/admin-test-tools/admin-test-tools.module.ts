import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { AdminTestToolsController } from "./admin-test-tools.controller";
import { AdminTestToolsService } from "./admin-test-tools.service";
import { TestLaneService } from "./test-lane.service";
import { ShipmentSimulationService } from "./shipment-simulation.service";
import { UatRefreshService } from "./uat-refresh/uat-refresh.service";
import { UatRefreshDispatchService } from "./uat-refresh/uat-refresh-dispatch.service";
import { UatRefreshReportController } from "./uat-refresh/uat-refresh-report.controller";
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
 *
 * Staging yenileme (`uat-refresh/`): admin uçları AdminTestToolsController'da,
 * workflow'un rapor ucu ayrı ve herkese açık (`UatRefreshReportController`,
 * koşuya özel token'la). docs/UAT_REFRESH.md.
 */
@Module({
  imports: [
    AuthModule,
    SuratCargoModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [AdminTestToolsController, UatRefreshReportController],
  providers: [
    AdminTestToolsService,
    TestLaneService,
    ShipmentSimulationService,
    UatRefreshService,
    UatRefreshDispatchService,
  ],
})
export class AdminTestToolsModule {}
