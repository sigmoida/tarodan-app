import { Module } from "@nestjs/common";import { BullModule } from "@nestjs/bull";
import { PayoutService } from "./payout.service";
import { PayoutSchedulerService } from "./payout-scheduler.service";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentProvidersModule } from "../payment-providers";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    PrismaModule,
    PaymentProvidersModule,
    NotificationModule,    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [PayoutService, PayoutSchedulerService],
  exports: [PayoutService, PayoutSchedulerService],
})
export class PayoutModule {}
