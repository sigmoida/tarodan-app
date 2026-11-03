import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { scheduledProcessors } from "../../../workers/scheduled-processors";
import { SellerTrustModule } from "../seller-trust.module";
import { SellerTrustInputsModule } from "../inputs/seller-trust-inputs.module";
import { SellerTrustSchedulerService } from "./seller-trust-scheduler.service";
import { SellerTrustScheduledProcessor } from "./seller-trust-scheduled.processor";

/**
 * The nightly seller trust batch. It reads every domain through
 * `SellerTrustInputsModule`, which imports the domain modules; only AppModule
 * imports this module, so no domain module ever depends on it (no cycle).
 * CacheModule is global (run lock).
 */
@Module({
  imports: [
    SellerTrustModule,
    SellerTrustInputsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [
    SellerTrustSchedulerService,
    ...scheduledProcessors(SellerTrustScheduledProcessor),
  ],
})
export class SellerTrustJobsModule {}
