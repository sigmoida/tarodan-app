import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
  OUTBOX_ORDER_FULFILLMENT,
  ShipmentCancelPayload,
  InvoiceRefundReversePayload,
  InvoiceTradeCashRefundReversePayload,
  OrderFulfillmentOutboxPayload,
} from "../outbox/outbox.types";
import { PaymentCommonService } from "./payment-common.service";
import { ElogoInvoicingService } from "../elogo";
import { PrismaService } from "../../prisma";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";

/**
 * Ödeme/iade yan-etkilerinin outbox handler'ları. onModuleInit'te
 * OutboxHandlerRegistry'ye kaydolur; drainer bunları dispatch eder.
 *
 * KRİTİK: handler'lar İDEMPOTENT olmalı (drainer at-least-once). cancelSuratShipmentIfExists
 * ve eLogo handleOrderRefund zaten no-op/idempotenttir, bu yüzden anlık yol + outbox
 * backstop birlikte güvenle çalışır (çift çalıştırma zararsız).
 */
@Injectable()
export class PaymentOutboxHandlers implements OnModuleInit {
  private readonly logger = new Logger(PaymentOutboxHandlers.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly paymentCommon: PaymentCommonService,
    private readonly elogoInvoicing: ElogoInvoicingService,
    private readonly prisma: PrismaService,
    private readonly fulfillmentFinalizer: FulfillmentFinalizer,
  ) {}

  onModuleInit(): void {
    this.registry.register(OUTBOX_SHIPMENT_CANCEL, async (payload) => {
      const { orderId, orderNumber } = payload as ShipmentCancelPayload;
      await this.paymentCommon.cancelSuratShipmentIfExists(
        orderId,
        orderNumber ?? orderId,
      );
    });

    this.registry.register(OUTBOX_INVOICE_REFUND_REVERSE, async (payload) => {
      const { orderId } = payload as InvoiceRefundReversePayload;
      await this.elogoInvoicing.handleOrderRefund(orderId);
    });

    this.registry.register(
      OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
      async (payload) => {
        const { tradeCashPaymentId } =
          payload as InvoiceTradeCashRefundReversePayload;
        await this.elogoInvoicing.handleTradeCashRefund(tradeCashPaymentId);
      },
    );

    // #8: fulfillment DAYANIKLILIK backstop'u. Anlık event yolu (OrderFulfillmentListener)
    // çökme penceresinde kaybolmuşsa — satır 'pending' kaldıysa — drainer buradan
    // sonlandırmayı tamamlar. Anlık yol BAŞARIRSA satırı 'completed' işaretler → bu handler
    // çalışmaz. Payload yalnız id taşır (PII yok); order/payment burada TAZE yüklenir.
    // finalizePaidOrder idempotenttir (ledger existence-guard + kargo mevcut-kontrol).
    this.registry.register(OUTBOX_ORDER_FULFILLMENT, async (payload) => {
      const { orderId, skipBuyer, transactionId } =
        payload as OrderFulfillmentOutboxPayload;
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { buyer: true, seller: true, product: true },
      });
      if (!order) {
        this.logger.warn(
          `Fulfillment backstop: order ${orderId} bulunamadı — no-op`,
        );
        return;
      }
      const payment = await this.prisma.payment.findFirst({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      });
      if (!payment) {
        this.logger.warn(
          `Fulfillment backstop: order ${orderId} için payment yok — no-op`,
        );
        return;
      }
      await this.fulfillmentFinalizer.finalizePaidOrder(order, payment, {
        skipBuyer,
        transactionId,
      });
    });
  }
}
