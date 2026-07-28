import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
  OUTBOX_ORDER_FULFILLMENT,
  OUTBOX_REVENUE_INVOICE_ISSUE,
  ShipmentCancelPayload,
  InvoiceRefundReversePayload,
  InvoiceTradeCashRefundReversePayload,
  OrderFulfillmentOutboxPayload,
  RevenueInvoiceIssuePayload,
} from "../outbox/outbox.types";
import { PaymentCommonService } from "./payment-common.service";
import { ElogoInvoicingService } from "../elogo";
import { PrismaService } from "../../prisma";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import { PaymentStatus } from "@prisma/client";

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
      const adjustment = payload as InvoiceRefundReversePayload;
      // Deploy öncesinden kuyrukta kalmış `{orderId}` payload'ları tam-iade
      // davranışıyla işlemeye devam et; yeni olaylar refundAttemptId taşır.
      if (!adjustment.refundAttemptId) {
        await this.elogoInvoicing.handleOrderRefund(adjustment.orderId);
        return;
      }
      await this.elogoInvoicing.handleOrderRefund(
        adjustment.orderId,
        adjustment,
      );
    });

    this.registry.register(
      OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
      async (payload) => {
        const { tradeCashPaymentId } =
          payload as InvoiceTradeCashRefundReversePayload;
        await this.elogoInvoicing.handleTradeCashRefund(tradeCashPaymentId);
      },
    );

    this.registry.register(OUTBOX_REVENUE_INVOICE_ISSUE, async (payload) => {
      const { orderId, kind } = payload as RevenueInvoiceIssuePayload;
      await this.elogoInvoicing.issueVirtualOrderInvoice(orderId, kind);
    });

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
        where: {
          status: PaymentStatus.completed,
          OR: [
            { orderId },
            ...(order.checkoutGroupId
              ? [{ checkoutGroupId: order.checkoutGroupId }]
              : []),
          ],
        },
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
