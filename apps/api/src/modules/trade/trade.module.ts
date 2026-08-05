import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { TradeController } from "./trade.controller";
import { TradeService } from "./trade.service";
import { TradeShipmentService } from "./trade-shipment.service";
import { TradeCommonService } from "./trade-common.service";
import { TradeQueryService } from "./trade-query.service";
import { TradeQuoteService } from "./trade-quote.service";
import { ShippingTariffModule } from "../shipping/shipping-tariff.module";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { TradeReconciliationService } from "./trade-reconciliation.service";
import { TradeSchedulerService } from "./trade-scheduler.service";
import { TradeScheduledProcessor } from "./trade-scheduled.processor";
import { TradeCashClearedListener } from "./trade-cash-cleared.listener";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { CacheModule } from "../cache/cache.module";
import { MembershipModule } from "../membership/membership.module";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { PaymentModule } from "../payment/payment.module";
import { ProductModule } from "../product/product.module";
import { EventModule } from "../events";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";
import { OrderTaxPolicyService } from "../order/order-tax-policy.service";

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    MembershipModule,
    NotificationModule,
    StorageModule,
    PaymentModule,
    ProductModule,
    EventModule,
    SuratCargoModule,
    // Takas kargo bedeli sipariş tarifesiyle AYNI kaynaktan gelir (leaf modül).
    ShippingTariffModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [TradeController],
  providers: [
    TradeService,
    // Vergi politikası (hizmet KDV oranı) siparişlerle ORTAK tek kaynaktır.
    OrderTaxPolicyService,
    TradeShipmentService,
    TradeCommonService,
    TradeQueryService,
    TradeQuoteService,
    TradeLifecycleService,
    TradeReconciliationService,
    TradeSchedulerService,
    ...scheduledProcessors(TradeScheduledProcessor),
    TradeCashClearedListener,
  ],
  exports: [TradeService, TradeQuoteService],
})
export class TradeModule {}
