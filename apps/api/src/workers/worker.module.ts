/**
 * BullMQ Worker Module
 * Centralized queue management for background job processing
 */
import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { ConfigModule } from "@nestjs/config";
import { BullRootModule } from "./bull-root.module";

// Workers
import { EmailWorker } from "./email.worker";
import { PushWorker } from "./push.worker";
import { ImageWorker } from "./image.worker";
import { PaymentWorker } from "./payment.worker";
import { ShippingWorker } from "./shipping.worker";
import { SearchWorker } from "./search.worker";
import { AnalyticsWorker } from "./analytics.worker";
import { ModerationWorker } from "./moderation.worker";

// Prisma for database access
import { PrismaModule } from "../prisma/prisma.module";
import { PaymentModule } from "../modules/payment/payment.module";
import { StorageModule } from "../modules/storage/storage.module";
import { SearchModule } from "../modules/search/search.module";
import { SuratCargoModule } from "../modules/surat-cargo/surat-cargo.module";
import { NotificationModule } from "../modules/notification/notification.module";
import { ModerationModule } from "../modules/moderation/moderation.module";
import { QUEUE_NAMES } from "./constants";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PaymentModule,
    StorageModule,
    SearchModule,
    SuratCargoModule,
    NotificationModule,
    ModerationModule,
    // Redis bağlantı kökü artık BullRootModule'de (tek yer, global).
    BullRootModule,
    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.IMAGE },
      { name: QUEUE_NAMES.PAYMENT },
      { name: QUEUE_NAMES.SHIPPING },
      { name: QUEUE_NAMES.SEARCH },
      { name: QUEUE_NAMES.ANALYTICS },
      { name: QUEUE_NAMES.MODERATION },
    ),
  ],
  providers: [
    EmailWorker,
    PushWorker,
    ImageWorker,
    PaymentWorker,
    ShippingWorker,
    SearchWorker,
    AnalyticsWorker,
    ModerationWorker,
  ],
  exports: [BullModule],
})
export class WorkerModule {}
