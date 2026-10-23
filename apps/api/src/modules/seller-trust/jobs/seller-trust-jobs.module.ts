import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { scheduledProcessors } from "../../../workers/scheduled-processors";
import { OrderModule } from "../../order/order.module";
import { RefundModule } from "../../refund/refund.module";
import { RatingModule } from "../../rating/rating.module";
import { TradeModule } from "../../trade/trade.module";
import { UserModule } from "../../user/user.module";
import { SellerTrustModule } from "../seller-trust.module";
import { SellerTrustSchedulerService } from "./seller-trust-scheduler.service";
import { SellerTrustScheduledProcessor } from "./seller-trust-scheduled.processor";

/**
 * The nightly seller trust batch. It reads each domain through that domain's
 * stats service, so it imports those modules; only AppModule imports this
 * module, so no domain module ever depends on it (no cycle). CacheModule is
 * global (run lock).
 */
@Module({
  imports: [
    SellerTrustModule,
    OrderModule,
    RefundModule,
    RatingModule,
    TradeModule,
    UserModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [
    SellerTrustSchedulerService,
    ...scheduledProcessors(SellerTrustScheduledProcessor),
  ],
})
export class SellerTrustJobsModule {}
