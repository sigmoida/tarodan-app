import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { UserService } from "./user.service";
import { UserCommonService } from "./user-common.service";
import { UserProfileService } from "./user-profile.service";
import { UserAddressService } from "./user-address.service";
import { UserSocialService } from "./user-social.service";
import { UserStatsService } from "./user-stats.service";
import { UserAnalyticsService } from "./user-analytics.service";
import { UserDiscoveryService } from "./user-discovery.service";
import { UserBankService } from "./user-bank.service";
import { UserEngagementService } from "./user-engagement.service";
import { UserController } from "./user.controller";
import { FeaturedSchedulerService } from "./featured-scheduler.service";
import { FeaturedScheduledProcessor } from "./featured-scheduled.processor";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { RatingModule } from "../rating/rating.module";
import { ModerationModule } from "../moderation/moderation.module";

@Module({
  imports: [
    NotificationModule,
    StorageModule,
    RatingModule,
    ModerationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [UserController],
  providers: [
    UserService,
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
    FeaturedScheduledProcessor,
  ],
  exports: [UserService],
})
export class UserModule {}
