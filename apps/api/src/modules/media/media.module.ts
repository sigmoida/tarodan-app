import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { MediaService } from "./media.service";
import { MediaController } from "./media.controller";
import { MediaCleanupService } from "./media-cleanup.service";
import {
  MediaCleanupSchedulerService,
  MediaScheduledProcessor,
} from "./media-scheduled.processor";
import { PrismaModule } from "../../prisma/prisma.module";
import { MembershipModule } from "../membership/membership.module";
import { StorageModule } from "../storage/storage.module";
import { ModerationModule } from "../moderation/moderation.module";
import { QUEUE_NAMES } from "../../workers/constants";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    MembershipModule,
    StorageModule,
    ModerationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaCleanupService,
    MediaCleanupSchedulerService,
    ...scheduledProcessors(MediaScheduledProcessor),
  ],
  exports: [MediaService],
})
export class MediaModule {}
