import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { AdminCommissionController } from "./admin-commission.controller";
import { AdminUserController } from "./admin-user.controller";
import { AdminProductController } from "./admin-product.controller";
import { AdminOrderController } from "./admin-order.controller";
import { AdminAnalyticsController } from "./admin-analytics.controller";
import { AdminModerationController } from "./admin-moderation.controller";
import { AdminPaymentController } from "./admin-payment.controller";
import { AdminTradeController } from "./admin-trade.controller";
import { AdminRefundController } from "./admin-refund.controller";
import { AdminContentController } from "./admin-content.controller";
import { AdminMessagingController } from "./admin-messaging.controller";
import { AdminSupportController } from "./admin-support.controller";
import { AdminNotificationController } from "./admin-notification.controller";
import { AdminCatalogController } from "./admin-catalog.controller";
import { AdminCatalogImportController } from "./admin-catalog-import.controller";
import { CatalogImportService } from "./catalog-import/catalog-import.service";
import { CatalogImportTemplateService } from "./catalog-import/catalog-import-template.service";
import { AdminTaxController } from "./admin-tax.controller";
import { AdminCollectionController } from "./admin-collection.controller";
import { AdminAdvertisementController } from "./admin-advertisement.controller";
import { AdminShippingController } from "./admin-shipping.controller";
import { AdminLogsController } from "./admin-logs.controller";
import { AdminReviewController } from "./admin-review.controller";
import { AdminSellerApplicationController } from "./admin-seller-application.controller";
import { AdminAdPackageController } from "./admin-ad-package.controller";
import { AdminService } from "./admin.service";
import { AdminPspReconciliationService } from "./admin-psp-reconciliation.service";
import { AdminMediaService } from "./admin-media.service";
import { AdminMediaController } from "./admin-media.controller";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCommissionService } from "./admin-commission.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminSiteAccessService } from "./admin-site-access.service";
import { AdminSiteAccessController } from "./admin-site-access.controller";
import { SiteAccessModule } from "../site-access/site-access.module";
import { AdminUserService } from "./admin-user.service";
import { AdminStaffService } from "./admin-staff.service";
import { AdminProductService } from "./admin-product.service";
import { AdminProductBulkImportService } from "./admin-product-bulk-import.service";
import {
  ProductImportBatchProcessor,
  ProductImportBatchScheduler,
} from "./product-import-batch.scheduler";
import { AdminOrderService } from "./admin-order.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminAnalyticsCommonService } from "./admin-analytics-common.service";
import { AdminAnalyticsDashboardService } from "./admin-analytics-dashboard.service";
import { AdminAnalyticsOrderService } from "./admin-analytics-order.service";
import { AdminAnalyticsReportService } from "./admin-analytics-report.service";
import { AdminModerationService } from "./admin-moderation.service";
import { AdminPaymentService } from "./admin-payment.service";
import { AdminPayoutService } from "./admin-payout.service";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminTradeService } from "./admin-trade.service";
import { AdminTradeCommonService } from "./admin-trade-common.service";
import { AdminTradeQueryService } from "./admin-trade-query.service";
import { AdminTradeWarehouseService } from "./admin-trade-warehouse.service";
import { AdminTradeResolutionService } from "./admin-trade-resolution.service";
import { AdminRefundService } from "./admin-refund.service";
import { AdminMessagingService } from "./admin-messaging.service";
import { AdminSupportService } from "./admin-support.service";
import { AdminContentService } from "./admin-content.service";
import { AdminTaxService } from "./admin-tax.service";
import { AdminMembershipService } from "./admin-membership.service";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminCollectionService } from "./admin-collection.service";
import { AdminNotificationService } from "./admin-notification.service";
import { AdminLogsService } from "./admin-logs.service";
import { AdminShippingService } from "./admin-shipping.service";
import { AdminShippingTariffService } from "./admin-shipping-tariff.service";
import { AdminReviewService } from "./admin-review.service";
import { AdminSellerApplicationService } from "./admin-seller-application.service";
import { AdminAdPackageService } from "./admin-ad-package.service";
import { ScheduledNotificationScheduler } from "./scheduled-notification.scheduler";
import { LogRetentionService } from "./log-retention.service";
import {
  LogRetentionScheduler,
  LogRetentionProcessor,
} from "./log-retention.scheduler";
import { ScheduledNotificationProcessor } from "./scheduled-notification.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { AuthModule } from "../auth";
import { PaymentModule } from "../payment";
import { MessagingModule } from "../messaging";
import { SupportModule } from "../support";
import { SearchModule } from "../search/search.module";
import { CacheModule } from "../cache";
import { AdvertisementModule } from "../advertisement/advertisement.module";
import { MediaModule } from "../media/media.module";
import { DiscountModule } from "../discount/discount.module";
import { EventModule } from "../events/event.module";
import { StorageModule } from "../storage/storage.module";
import { ModerationModule } from "../moderation/moderation.module";
import { RatingModule } from "../rating/rating.module";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { RefundModule } from "../refund/refund.module";
import { NotificationModule } from "../notification/notification.module";
import { OrderModule } from "../order/order.module";
import { ElogoModule } from "../elogo/elogo.module";
import { ShippingTariffModule } from "../shipping/shipping-tariff.module";
import { TradeModule } from "../trade/trade.module";
import { CommissionModule } from "../commission/commission.module";
import { MembershipModule } from "../membership/membership.module";
import { ProductModule } from "../product/product.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PaymentModule,
    MessagingModule,
    SupportModule,
    SearchModule,
    CacheModule,
    AdvertisementModule,
    MediaModule,
    DiscountModule,
    EventModule,
    StorageModule,
    RatingModule,
    SuratCargoModule,
    RefundModule,
    NotificationModule,
    OrderModule,
    ModerationModule,
    ElogoModule,
    ShippingTariffModule,
    TradeModule,
    CommissionModule,
    MembershipModule,
    ProductModule,
    SiteAccessModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.MODERATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SEARCH }),
  ],
  controllers: [
    AdminMediaController,
    AdminCommissionController,
    AdminUserController,
    AdminProductController,
    AdminOrderController,
    AdminAnalyticsController,
    AdminModerationController,
    AdminPaymentController,
    AdminTradeController,
    AdminRefundController,
    AdminContentController,
    AdminMessagingController,
    AdminSupportController,
    AdminNotificationController,
    // İçe aktarma uçları katalog controller'ından ÖNCE: bugün çakışan bir
    // `brands/:id` GET route'u yok, ama ileride eklenirse `brands/import-*`
    // yollarını yutmasın (Nest kayıt sırasına göre eşler).
    AdminCatalogImportController,
    AdminCatalogController,
    AdminTaxController,
    AdminCollectionController,
    AdminAdvertisementController,
    AdminShippingController,
    AdminLogsController,
    AdminReviewController,
    AdminSellerApplicationController,
    AdminAdPackageController,
    AdminSiteAccessController,
  ],
  providers: [
    AdminService,
    AdminPspReconciliationService,
    AdminMediaService,
    AdminAuditService,
    AdminCommissionService,
    AdminSettingsService,
    AdminSiteAccessService,
    AdminUserService,
    AdminStaffService,
    AdminProductService,
    AdminProductBulkImportService,
    AdminOrderService,
    AdminAnalyticsService,
    AdminAnalyticsCommonService,
    AdminAnalyticsDashboardService,
    AdminAnalyticsOrderService,
    AdminAnalyticsReportService,
    AdminModerationService,
    AdminPaymentService,
    AdminPayoutService,
    AdminFinanceService,
    AdminTradeService,
    AdminTradeCommonService,
    AdminTradeQueryService,
    AdminTradeWarehouseService,
    AdminTradeResolutionService,
    AdminRefundService,
    AdminMessagingService,
    AdminSupportService,
    AdminContentService,
    AdminTaxService,
    AdminMembershipService,
    AdminCatalogService,
    CatalogImportService,
    CatalogImportTemplateService,
    AdminCollectionService,
    AdminNotificationService,
    AdminLogsService,
    AdminShippingService,
    AdminShippingTariffService,
    AdminReviewService,
    AdminSellerApplicationService,
    AdminAdPackageService,
    ScheduledNotificationScheduler,
    ...scheduledProcessors(ScheduledNotificationProcessor),
    LogRetentionService,
    LogRetentionScheduler,
    ...scheduledProcessors(LogRetentionProcessor),
    ProductImportBatchScheduler,
    ...scheduledProcessors(ProductImportBatchProcessor),
  ],
  exports: [AdminService],
})
export class AdminModule {}
