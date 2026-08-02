import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MarketingSchedulerService } from "./marketing-scheduler.service";
import { MarketingScheduledProcessor } from "./marketing-scheduled.processor";
import { NewsletterService } from "./newsletter.service";
import { NewsletterController } from "./newsletter.controller";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    StorageModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [NewsletterController],
  providers: [
    MarketingSchedulerService,
    ...scheduledProcessors(MarketingScheduledProcessor),
    NewsletterService,
  ],
  exports: [MarketingSchedulerService, NewsletterService],
})
export class MarketingModule {}
