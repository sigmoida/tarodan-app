import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { ShippingController } from "./shipping.controller";
import { ShippingService } from "./shipping.service";
import { ShippingSchedulerService } from "./shipping-scheduler.service";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentModule } from "../payment/payment.module";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    PaymentModule,
    SuratCargoModule,
    NotificationModule,
    // Cron'ların Bull repeatable'a taşınması için paylaşılan kuyruk.
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [ShippingController],
  providers: [ShippingService, ShippingSchedulerService],
  exports: [ShippingService, ShippingSchedulerService],
})
export class ShippingModule {}
