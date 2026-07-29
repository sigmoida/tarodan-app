import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { OrderPricingService } from "./order-pricing.service";
import { OrderCheckoutService } from "./order-checkout.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderCheckoutDirectService } from "./order-checkout-direct.service";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import { OrderGuestCheckoutService } from "./order-guest-checkout.service";
import { OrderCommonService } from "./order-common.service";
import { OrderQueryService } from "./order-query.service";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { OrderSchedulerService } from "./order-scheduler.service";
import { OrderScheduledProcessor } from "./order-scheduled.processor";
import { SellerInvoiceController } from "./seller-invoice.controller";
import { SellerInvoiceService } from "./seller-invoice.service";
import { SmtpProvider } from "../notification/providers/smtp.provider";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { EventModule } from "../events";
import { NotificationModule } from "../notification/notification.module";
import { DiscountModule } from "../discount";
import { StorageModule } from "../storage/storage.module";
import { SuratCargoModule } from "../surat-cargo/surat-cargo.module";
import { ProductModule } from "../product/product.module";
import { CommissionModule } from "../commission/commission.module";
import { TaxModule } from "../tax/tax.module";
import { ElogoModule } from "../elogo";
import { ShippingTariffModule } from "../shipping/shipping-tariff.module";
import { RefundModule } from "../refund/refund.module";

@Module({
  imports: [
    PrismaModule,
    EventModule,
    NotificationModule,
    DiscountModule,
    StorageModule,
    SuratCargoModule,
    ProductModule,
    CommissionModule,
    TaxModule,
    ElogoModule,
    ShippingTariffModule,
    RefundModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [OrderController, SellerInvoiceController],
  providers: [
    OrderService,
    OrderPricingService,
    OrderCheckoutService,
    OrderCheckoutCommonService,
    OrderCheckoutDirectService,
    OrderCheckoutGroupService,
    OrderGuestCheckoutService,
    OrderCommonService,
    OrderQueryService,
    OrderLifecycleService,
    OrderSchedulerService,
    OrderScheduledProcessor,
    SellerInvoiceService,
    SmtpProvider,
  ],
  exports: [OrderService],
})
export class OrderModule {}
