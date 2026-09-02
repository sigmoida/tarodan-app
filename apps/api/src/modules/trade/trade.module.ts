import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { TradeController } from "./trade.controller";
import { TradeService } from "./trade.service";
import { TradeShipmentService } from "./lifecycle/trade-shipment.service";
import { TradeCommonService } from "./trade-common.service";
import { TradeQueryService } from "./trade-query.service";
import { TradeQuoteService } from "./trade-quote.service";
import { ShippingTariffModule } from "../shipping/tariff/shipping-tariff.module";
import { WarehouseAddressModule } from "../shipping/warehouse/warehouse-address.module";
import { TradeLifecycleService } from "./lifecycle/trade-lifecycle.service";
import { TradeReconciliationService } from "./lifecycle/trade-reconciliation.service";
import { TradeSchedulerService } from "./jobs/trade-scheduler.service";
import { TradeScheduledProcessor } from "./jobs/trade-scheduled.processor";
import { TradeCashClearedListener } from "./lifecycle/trade-cash-cleared.listener";
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
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { DiscountModule } from "../discount/discount.module";

import { UserBlockModule } from "../user-block/user-block.module";

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
    UserBlockModule,
    SuratCargoModule,
    // Takas kargo bedeli sipariş tarifesiyle AYNI kaynaktan gelir (leaf modül).
    ShippingTariffModule,
    // Depo adresi (inbound bacağın ALICI'sı) tek kaynaktan okunur (leaf modül).
    WarehouseAddressModule,
    // Takas hizmet bedeli kampanyası (İ25) — DiscountService kabulde çözer.
    DiscountModule,
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
