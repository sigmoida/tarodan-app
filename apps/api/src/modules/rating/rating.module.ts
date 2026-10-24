import { Module } from "@nestjs/common";
import { RatingController } from "./rating.controller";
import { RatingService } from "./rating.service";
import { RatingSellerTrustStatsService } from "./stats/rating-seller-trust-stats.service";
import { RatingModerationService } from "./moderation/rating-moderation.service";
import { PrismaModule } from "../../prisma";
import { CacheModule } from "../cache/cache.module";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { ModerationModule } from "../moderation/moderation.module";
import { UserBlockModule } from "../user-block/user-block.module";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    NotificationModule,
    StorageModule,
    ModerationModule,
    // A blocked user's reviews and ratings are not listed to the blocker (Apple 1.2).
    UserBlockModule,
    // Moderation re-syncs the product's search document after commit.
    SearchModule,
  ],
  controllers: [RatingController],
  providers: [
    RatingService,
    RatingSellerTrustStatsService,
    RatingModerationService,
  ],
  // RatingSellerTrustStatsService: rating input of the seller trust batch.
  // RatingModerationService: admin hide / show again (AdminReviewService).
  exports: [
    RatingService,
    RatingSellerTrustStatsService,
    RatingModerationService,
  ],
})
export class RatingModule {}
