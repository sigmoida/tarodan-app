import { Module } from "@nestjs/common";
import { RatingController } from "./rating.controller";
import { RatingService } from "./rating.service";
import { RatingSellerTrustStatsService } from "./stats/rating-seller-trust-stats.service";
import { PrismaModule } from "../../prisma";
import { CacheModule } from "../cache/cache.module";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { ModerationModule } from "../moderation/moderation.module";
import { UserBlockModule } from "../user-block/user-block.module";

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    NotificationModule,
    StorageModule,
    ModerationModule,
    // Engellenen kullanıcının yorum/puanları engelleyene listelenmez (Apple 1.2).
    UserBlockModule,
  ],
  controllers: [RatingController],
  providers: [RatingService, RatingSellerTrustStatsService],
  // RatingSellerTrustStatsService: rating input of the seller trust batch.
  exports: [RatingService, RatingSellerTrustStatsService],
})
export class RatingModule {}
