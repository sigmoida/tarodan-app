import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { AdminCommissionController } from "./finance/admin-commission.controller";
import { AdminUserController } from "./users/admin-user.controller";
import { AdminProductController } from "./catalog/admin-product.controller";
import { AdminOrderController } from "./orders/admin-order.controller";
import { AdminAnalyticsController } from "./analytics/admin-analytics.controller";
import { AdminModerationController } from "./ops/admin-moderation.controller";
import { AdminPaymentController } from "./finance/admin-payment.controller";
import { AdminTradeController } from "./trade/admin-trade.controller";
import { AdminOfferController } from "./orders/admin-offer.controller";
import { AdminRefundController } from "./orders/admin-refund.controller";
import { AdminContentController } from "./catalog/admin-content.controller";
import { AdminMessagingController } from "./ops/admin-messaging.controller";
import { AdminSupportController } from "./ops/admin-support.controller";
import { AdminNotificationController } from "./ops/admin-notification.controller";
import { AdminCatalogController } from "./catalog/admin-catalog.controller";
import { AdminTaxController } from "./finance/admin-tax.controller";
import { AdminCollectionController } from "./catalog/admin-collection.controller";
import { AdminAdvertisementController } from "./catalog/admin-advertisement.controller";
import { AdminShippingController } from "./orders/admin-shipping.controller";
import { AdminLogsController } from "./analytics/admin-logs.controller";
import { AdminReviewController } from "./ops/admin-review.controller";
import { AdminSellerApplicationController } from "./users/admin-seller-application.controller";
import { AdminAdPackageController } from "./finance/admin-ad-package.controller";
import { AdminCatalogImportController } from "./catalog/admin-catalog-import.controller";
import { CatalogImportService } from "./catalog/catalog-import/catalog-import.service";
import { CatalogImportTemplateService } from "./catalog/catalog-import/catalog-import-template.service";
import { AdminService } from "./admin.service";
import { AdminPspReconciliationService } from "./finance/admin-psp-reconciliation.service";
import { AdminMediaService } from "./catalog/admin-media.service";
import { AdminMediaController } from "./catalog/admin-media.controller";
import { AdminAuditService } from "./ops/admin-audit.service";
import { AdminCommissionService } from "./finance/admin-commission.service";
import { AdminSettingsService } from "./ops/admin-settings.service";
import { AdminSiteAccessService } from "./users/admin-site-access.service";
import { AdminSiteAccessController } from "./users/admin-site-access.controller";
import { SiteAccessModule } from "../site-access/site-access.module";
import { AdminUserService } from "./users/admin-user.service";
import { UserModule } from "../user/user.module";
import { AdminUserAccountService } from "./users/admin-user-account.service";
import { AdminStaffService } from "./users/admin-staff.service";
import { AdminProductService } from "./catalog/admin-product.service";
import { AdminProductBulkImportService } from "./catalog/admin-product-bulk-import.service";
import {
  ProductImportBatchProcessor,
  ProductImportBatchScheduler,
} from "./jobs/product-import-batch.scheduler";
import { AdminOrderService } from "./orders/admin-order.service";
import { AdminAnalyticsService } from "./analytics/admin-analytics.service";
import { AdminAnalyticsCommonService } from "./analytics/admin-analytics-common.service";
import { AdminAnalyticsDashboardService } from "./analytics/admin-analytics-dashboard.service";
import { AdminAnalyticsOrderService } from "./analytics/admin-analytics-order.service";
import { AdminAnalyticsReportService } from "./analytics/admin-analytics-report.service";
import { AdminModerationService } from "./ops/admin-moderation.service";
import { AdminPaymentService } from "./finance/admin-payment.service";
import { AdminPayoutService } from "./finance/admin-payout.service";
import { AdminFinanceService } from "./finance/admin-finance.service";
import { AdminTradeService } from "./trade/admin-trade.service";
import { AdminTradeCommonService } from "./trade/admin-trade-common.service";
import { WarehouseAddressModule } from "../shipping/warehouse/warehouse-address.module";
import { AdminTradeQueryService } from "./trade/admin-trade-query.service";
import { AdminOfferQueryService } from "./orders/admin-offer-query.service";
import { AdminOfferService } from "./orders/admin-offer.service";
import { AdminTradeWarehouseService } from "./trade/admin-trade-warehouse.service";
import { AdminTradeResolutionService } from "./trade/admin-trade-resolution.service";
import { AdminRefundService } from "./orders/admin-refund.service";
import { AdminMessagingService } from "./ops/admin-messaging.service";
import { AdminSupportService } from "./ops/admin-support.service";
import { AdminContentService } from "./catalog/admin-content.service";
import { AdminTaxService } from "./finance/admin-tax.service";
import { AdminMembershipService } from "./finance/admin-membership.service";
import { AdminCatalogService } from "./catalog/admin-catalog.service";
import { AdminCollectionService } from "./catalog/admin-collection.service";
import { AdminNotificationService } from "./ops/admin-notification.service";
import { AdminLogsService } from "./analytics/admin-logs.service";
import { AdminShippingService } from "./orders/admin-shipping.service";
import { AdminShippingTariffService } from "./orders/admin-shipping-tariff.service";
import { AdminReviewService } from "./ops/admin-review.service";
import { AdminSellerApplicationService } from "./users/admin-seller-application.service";
import { AdminAdPackageService } from "./finance/admin-ad-package.service";
import { ScheduledNotificationScheduler } from "./jobs/scheduled-notification.scheduler";
import { LogRetentionService } from "./jobs/log-retention.service";
import {
  LogRetentionScheduler,
  LogRetentionProcessor,
} from "./jobs/log-retention.scheduler";
import { ScheduledNotificationProcessor } from "./jobs/scheduled-notification.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { AuthModule } from "../auth";
import { PaymentModule } from "../payment";
// Manuel escrow release fast-path'i: scoped payout oluşturma PayoutService'ten.
import { PayoutModule } from "../payout/payout.module";
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
import { ShippingTariffModule } from "../shipping/tariff/shipping-tariff.module";
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
    PayoutModule,
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
    UserModule,
    ModerationModule,
    ElogoModule,
    ShippingTariffModule,
    // Depo adresi tek kaynağı — AdminTradeCommonService buna delege eder.
    WarehouseAddressModule,
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
    AdminOfferController,
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
    AdminUserAccountService,
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
    AdminOfferQueryService,
    AdminOfferService,
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
