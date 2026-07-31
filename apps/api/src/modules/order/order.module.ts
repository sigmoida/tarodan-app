import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { OrderPricingService } from "./order-pricing.service";
import { OrderCheckoutService } from "./order-checkout.service";
import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderTaxPolicyService } from "./order-tax-policy.service";
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
import { MailModule } from "../mail/mail.module";
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
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    MailModule,
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
    // Vergi politikası (ürün KDV / hizmet KDV / stopaj kapsamı) — tek kaynak.
    OrderTaxPolicyService,
    OrderCheckoutDirectService,
    OrderCheckoutGroupService,
    OrderGuestCheckoutService,
    OrderCommonService,
    OrderQueryService,
    OrderLifecycleService,
    OrderSchedulerService,
    ...scheduledProcessors(OrderScheduledProcessor),
    SellerInvoiceService,
  ],
  // OrderCheckoutCommonService: teklif/sipariş bedel primitifleri (OfferService
  // teklif kabulünde aynı hesabı kullanır — tek kaynak).
  exports: [OrderService, OrderCheckoutCommonService, OrderTaxPolicyService],
})
export class OrderModule {}
