import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MembershipController } from "./membership.controller";
import { MembershipService } from "./membership.service";
import { MembershipCommonService } from "./membership-common.service";
import { MembershipSubscriptionService } from "./membership-subscription.service";
import { MembershipTierUpdateService } from "./membership-tier-update.service";
import { AdminAuditService } from "../admin/ops/admin-audit.service";
import { MembershipSchedulerService } from "./membership-scheduler.service";
import { MembershipScheduledProcessor } from "./membership-scheduled.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { PaymentModule } from "../payment/payment.module";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { NotificationModule } from "../notification/notification.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";
import { SavedCardOutboxHandlers } from "./saved-card-outbox-handlers.service";

@Module({
  imports: [
    PrismaModule,
    PaymentModule,
    PaymentProvidersModule,
    // Üyelik bitiyor/bitti bildirimleri (scheduler + expiry sweep).
    NotificationModule,
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
    // Katman güncelleme çekirdeği — audit yazımı için AdminAuditService'i de
    // burada sağlarız (durumsuz, yalnız Prisma'ya bağlı; AdminModule bu modülü
    // import ettiğinden ters yönde modül importu döngü yaratırdı).
    MembershipTierUpdateService,
    AdminAuditService,
    SavedCardOutboxHandlers,
    MembershipSchedulerService,
    ...scheduledProcessors(MembershipScheduledProcessor),
  ],
  exports: [
    MembershipService,
    MembershipSchedulerService,
    // Admin modülündeki paralel rota (AdminMembershipService) aynı çekirdeği kullanır.
    MembershipTierUpdateService,
  ],
})
export class MembershipModule {}
