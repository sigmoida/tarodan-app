import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MarketingSchedulerService } from "./marketing-scheduler.service";
import { NewsletterService } from "./newsletter.service";
import { NewsletterController } from "./newsletter.controller";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    StorageModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [NewsletterController],
  providers: [MarketingSchedulerService, NewsletterService],
  exports: [MarketingSchedulerService, NewsletterService],
})
export class MarketingModule {}
