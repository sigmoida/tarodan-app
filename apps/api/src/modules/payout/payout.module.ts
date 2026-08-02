import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PayoutService } from "./payout.service";
import { PayoutCallbackController } from "./payout-callback.controller";
import { PayoutSchedulerService } from "./payout-scheduler.service";
import { PayoutScheduledProcessor } from "./payout-scheduled.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentProvidersModule } from "../payment-providers";
import { NotificationModule } from "../notification/notification.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    PaymentProvidersModule,
    NotificationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [PayoutCallbackController],
  providers: [
    PayoutService,
    PayoutSchedulerService,
    ...scheduledProcessors(PayoutScheduledProcessor),
  ],
  exports: [PayoutService],
})
export class PayoutModule {}
