import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MembershipController } from "./membership.controller";
import { MembershipService } from "./membership.service";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipSubscriptionService } from "./membership-subscription.service";
import { MembershipSchedulerService } from "./membership-scheduler.service";
import { MembershipScheduledProcessor } from "./membership-scheduled.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentModule } from "../payment/payment.module";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    PaymentProvidersModule,
    BullModule.registerQueue({ name: "email" }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    // Takas yetkisi düşen satıcının ürünleri yeniden indekslenir (arama
    // dokümanındaki sellerCanTrade üyelikten türetilir).
    BullModule.registerQueue({ name: QUEUE_NAMES.SEARCH }),
  ],
  controllers: [MembershipController],
  providers: [
    MembershipService,
    MembershipCommonService,
    MembershipSubscriptionService,
    MembershipSchedulerService,
    ...scheduledProcessors(MembershipScheduledProcessor),
  ],
  exports: [MembershipService, MembershipSchedulerService],
})
export class MembershipModule {}
