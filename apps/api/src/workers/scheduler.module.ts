import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "./constants";

// Feature modülleri — scheduler servislerini (processor'ların inject ettiği) sağlar.
import { PayoutModule } from "../modules/payout/payout.module";
import { OrderModule } from "../modules/order/order.module";
import { PaymentModule } from "../modules/payment/payment.module";
import { MembershipModule } from "../modules/membership/membership.module";
import { TradeModule } from "../modules/trade/trade.module";
import { RefundModule } from "../modules/refund/refund.module";
import { OfferModule } from "../modules/offer/offer.module";
import { ProductModule } from "../modules/product/product.module";
import { MarketingModule } from "../modules/marketing/marketing.module";
import { ShippingModule } from "../modules/shipping/shipping.module";
import { SearchModule } from "../modules/search/search.module";
import { AdminModule } from "../modules/admin/admin.module";
import { ElogoModule } from "../modules/elogo";
import { UserModule } from "../modules/user/user.module";

// Scheduled ('scheduled' kuyruğu) processor'lar — TÜKETİCİLER.
import { PayoutScheduledProcessor } from "../modules/payout/payout-scheduled.processor";
import { OrderScheduledProcessor } from "../modules/order/order-scheduled.processor";
import { PaymentScheduledProcessor } from "../modules/payment/payment-scheduled.processor";
import { MembershipScheduledProcessor } from "../modules/membership/membership-scheduled.processor";
import { TradeScheduledProcessor } from "../modules/trade/trade-scheduled.processor";
import { RefundScheduledProcessor } from "../modules/refund/refund-scheduled.processor";
import { OfferScheduledProcessor } from "../modules/offer/offer-scheduled.processor";
import { BoostScheduledProcessor } from "../modules/product/boost-scheduled.processor";
import { MarketingScheduledProcessor } from "../modules/marketing/marketing-scheduled.processor";
import { ShippingScheduledProcessor } from "../modules/shipping/shipping-scheduled.processor";
import { SearchScheduledProcessor } from "../modules/search/search-scheduled.processor";
import { ScheduledNotificationProcessor } from "../modules/admin/scheduled-notification.processor";
import { ElogoScheduledProcessor } from "../modules/elogo/elogo-scheduled.processor";
import { FeaturedScheduledProcessor } from "../modules/user/featured-scheduled.processor";
import { ScheduledJanitorService } from "./scheduled-janitor.service";

/**
 * WORKER-ONLY: 'scheduled' kuyruğunun TÜM cron processor'larını tek yerde toplar.
 *
 * Yalnız worker entrypoint'i (WorkerAppModule) bu modülü yükler; AppModule (API)
 * YÜKLEMEZ. Böylece API scheduled kuyruğunu TÜKETMEZ — yalnız worker tüketir.
 * (Bull tek-teslim garantisi zaten çift-çalışmayı önler; bu ayrım "temizlik +
 * ölçek" içindir: API sadece HTTP, cron yükü worker'da.)
 *
 * Scheduler SERVİSLERİ hâlâ feature modüllerinde durur (dual-mode @TrackedCron +
 * onModuleInit registration orada). Buradaki processor'lar onları feature
 * modüllerinden inject eder — o yüzden feature modülleri scheduler servislerini
 * export ETMELİ.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    PayoutModule,
    OrderModule,
    PaymentModule,
    MembershipModule,
    TradeModule,
    RefundModule,
    OfferModule,
    ProductModule,
    MarketingModule,
    ShippingModule,
    SearchModule,
    AdminModule,
    ElogoModule,
    UserModule,
  ],
  providers: [
    PayoutScheduledProcessor,
    OrderScheduledProcessor,
    PaymentScheduledProcessor,
    MembershipScheduledProcessor,
    TradeScheduledProcessor,
    RefundScheduledProcessor,
    OfferScheduledProcessor,
    BoostScheduledProcessor,
    MarketingScheduledProcessor,
    ShippingScheduledProcessor,
    SearchScheduledProcessor,
    ScheduledNotificationProcessor,
    ElogoScheduledProcessor,
    FeaturedScheduledProcessor,
    // Worker-only: ölü repeatable key'lerini bootstrap'ta süpürür (H4).
    ScheduledJanitorService,
  ],
})
export class SchedulerModule {}
