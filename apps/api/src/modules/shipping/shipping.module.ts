import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";
import { ShippingSchedulerService } from "./shipping-scheduler.service";
import { ShippingScheduledProcessor } from "./shipping-scheduled.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentModule } from "../payment/payment.module";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PaymentModule,
    SuratCargoModule,
    NotificationModule,
    // Cron'ların Bull repeatable'a taşınması için paylaşılan kuyruk.
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [ShippingController],
  providers: [
    ShippingService,
    ShippingSchedulerService,
    ShippingScheduledProcessor,
  ],
  exports: [ShippingService],
})
export class ShippingModule {}
