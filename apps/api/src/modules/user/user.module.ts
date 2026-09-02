import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { UserService } from "./user.service";
import { UserCommonService } from "./user-common.service";
import { UserProfileService } from "./profile/user-profile.service";
import { UserAddressService } from "./profile/user-address.service";
import { UserSocialService } from "./social/user-social.service";
import { UserStatsService } from "./stats/user-stats.service";
import { UserAnalyticsService } from "./stats/user-analytics.service";
import { UserDiscoveryService } from "./social/user-discovery.service";
import { UserBankService } from "./seller/user-bank.service";
import { UserEngagementService } from "./stats/user-engagement.service";
import { UserController } from "./user.controller";
import { SellerDocumentController } from "./seller/seller-document.controller";
import { SellerDocumentService } from "./seller/seller-document.service";
import { FeaturedSchedulerService } from "./jobs/featured-scheduler.service";
import { FeaturedScheduledProcessor } from "./jobs/featured-scheduled.processor";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { RatingModule } from "../rating/rating.module";
import { ModerationModule } from "../moderation/moderation.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";
import { UserBlockModule } from "../user-block/user-block.module";
import { UserBlockAdminListener } from "./social/user-block-admin.listener";

@Module({
  imports: [
    NotificationModule,
    StorageModule,
    RatingModule,
    ModerationModule,
    UserBlockModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [UserController, SellerDocumentController],
  providers: [
    UserService,
    SellerDocumentService,
    UserCommonService,
    UserProfileService,
    UserAddressService,
    UserSocialService,
    UserStatsService,
    UserAnalyticsService,
    UserDiscoveryService,
    UserBankService,
    UserEngagementService,
    FeaturedSchedulerService,
    UserBlockAdminListener,
    ...scheduledProcessors(FeaturedScheduledProcessor),
  ],
  exports: [UserService],
})
export class UserModule {}
