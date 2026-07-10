import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { MonitoringModule } from "../monitoring/monitoring.module";
import { BullRootModule } from "./bull-root.module";
import { WorkerModule } from "./worker.module";
import { SchedulerModule } from "./scheduler.module";
import { SentryModule } from "../modules/sentry";

/**
 * Worker process'inin KÖK modülü (worker.ts bunu yükler; API AppModule'ü yükler).
 *
 * İçerik:
 *  - BullRootModule    → Redis bağlantı kökü (tek yer).
 *  - WorkerModule      → 8 event-kuyruğu worker'ı (email/push/image/... consumer'ları).
 *  - SchedulerModule   → TÜM 'scheduled' cron processor'ları (tüketiciler).
 *
 * ConfigModule.forRoot BURADA olmalı (H6): worker AppModule'ü yüklemediği için .env'i
 * kendisi yüklemeli — aksi halde REDIS ve DATABASE_URL değişkenleri default'a düşer
 * ve worker localhost'a bağlanmaya çalışır. envFilePath AppModule ile birebir aynı.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === "test"
          ? [".env.test"]
          : [".env.local", ".env", "env.txt"],
    }),
    PrismaModule,
    MonitoringModule,
    // Sentry: DSN varsa worker hatalarını (Bull job fail dahil) merkezi alarma gönderir.
    SentryModule,
    BullRootModule,
    WorkerModule,
    SchedulerModule,
  ],
})
export class WorkerAppModule {}
