import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { ModerationModule } from "../moderation/moderation.module";
import { ProductService } from "./product.service";
import { ProductCommonService } from "./product-common.service";
import { ProductCreateService } from "./lifecycle/product-create.service";
import { ProductUpdateService } from "./lifecycle/product-update.service";
import { ProductRenewalService } from "./lifecycle/product-renewal.service";
import { ProductQueryService } from "./query/product-query.service";
import { ProductFilterService } from "./query/product-filter.service";
import { ProductRankingService } from "./ranking/product-ranking.service";
import { ProductStatsService } from "./ranking/product-stats.service";
import { ProductEngagementService } from "./ranking/product-engagement.service";
import { ProductBoostService } from "./ranking/product-boost.service";
import { BoostNoticeService } from "./ranking/boost-notice.service";
import { BoostAudienceService } from "./boost-seller/boost-audience.service";
import { BoostSellerService } from "./boost-seller/boost-seller.service";
import { BoostOfferService } from "./boost-seller/boost-offer.service";
import { ProductController } from "./product.controller";
import { ProductSchedulerService } from "./jobs/product-scheduler.service";
import { BoostScheduledProcessor } from "./jobs/boost-scheduled.processor";
import { ProductLockModule } from "./lock/product-lock.module";
import { BoostTimelineModule } from "./boost-timeline/boost-timeline.module";
import { MembershipModule } from "../membership/membership.module";
import { SearchModule } from "../search/search.module";
import { WishlistModule } from "../wishlist/wishlist.module";
import { NotificationModule } from "../notification/notification.module";
import { DiscountModule } from "../discount/discount.module";
import { StorageModule } from "../storage/storage.module";
import { PaymentModule } from "../payment";
import { scheduledProcessors } from "../../workers/scheduled-processors";
import { CommissionModule } from "../commission/commission.module";
import { SellerTrustModule } from "../seller-trust";
import { ConsentModule } from "../consent/consent.module";

import { UserBlockModule } from "../user-block/user-block.module";

@Module({
  imports: [
    MembershipModule,
    SearchModule,
    UserBlockModule,
    WishlistModule,
    NotificationModule,
    DiscountModule,
    StorageModule,
    PaymentModule,
    ProductLockModule,
    // The expire-boosts cron changes listing timelines through their owner.
    BoostTimelineModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.MODERATION }),
    // Pilot: cron-tipi işler için 'scheduled' kuyruğu (Bull Board otomatik gösterir).
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    ModerationModule,
    CommissionModule,
    // Ranking reads the stored seller trust score. A leaf, no cycle.
    SellerTrustModule,
    // The boost purchase records its consents with the order. A leaf.
    ConsentModule,
  ],
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductCommonService,
    ProductCreateService,
    ProductUpdateService,
    ProductRenewalService,
    ProductQueryService,
    ProductFilterService,
    ProductRankingService,
    ProductStatsService,
    ProductEngagementService,
    ProductBoostService,
    // Seller notices of a boost (outbox handler + immediate send).
    BoostNoticeService,
    // The seller's side: who may buy what, "My boosts" and the offers.
    BoostAudienceService,
    BoostSellerService,
    BoostOfferService,
    ProductSchedulerService,
    ...scheduledProcessors(BoostScheduledProcessor),
  ],
  // ProductLockModule'ü re-export et: ProductModule'ü import eden order/offer/trade
  // hâlâ ProductLockService'i alsın (davranış korunur).
  exports: [
    ProductService,
    ProductCommonService,
    ProductRankingService,
    ProductBoostService,
    BoostNoticeService,
    ProductSchedulerService,
    // Admin bakım işlemi (süresi dolmuş ilanları işaretle/reaktive et) yazmayı
    // alan servisten yapar — doğrudan Prisma yazımı değil.
    ProductRenewalService,
    ProductLockModule,
  ],
})
export class ProductModule {}
