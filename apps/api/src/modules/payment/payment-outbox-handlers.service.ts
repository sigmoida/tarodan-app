import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND,
  type TradeCancelledPaymentRefundPayload,
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  OUTBOX_INVOICE_TRADE_CASH_REFUND_REVERSE,
  OUTBOX_ORDER_FULFILLMENT,
  OUTBOX_REVENUE_INVOICE_ISSUE,
  OUTBOX_ORDER_REVENUE_INVOICE,
  ShipmentCancelPayload,
  InvoiceRefundReversePayload,
  InvoiceTradeCashRefundReversePayload,
  OrderFulfillmentOutboxPayload,
  RevenueInvoiceIssuePayload,
  OrderRevenueInvoicePayload,
} from "../outbox/outbox.types";
import { PaymentCommonService } from "./payment-common.service";
import { ElogoInvoicingService } from "../elogo";
import { refundRequestIdOf } from "../elogo/helpers/refund-request-key";
import { PrismaService } from "../../prisma";
import { FulfillmentFinalizer } from "./fulfillment/fulfillment-finalizer.service";
import { PaymentRefundService } from "./refund/payment-refund.service";
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
    // İptal edilmiş takasa sonradan gelen ödemenin iadesi (aynı modülün
    // izlenen takas iade yolu). @Optional: dar unit test kurulumları için.
    @Optional() private readonly paymentRefund?: PaymentRefundService,
  ) {}

  onModuleInit(): void {
    // İptal edilmiş takasa sonradan tamamlanan ödemenin iadesi — YALNIZ buradan
    // (drainer, PayTR callback'i yanıtlandıktan sonra) çalışır; callback'in
    // içinden iade edilmez (bkz. PaymentFulfillmentService). İade idempotenttir
    // (ödeme başına deneme defteri). PayTR ödemeyi henüz "siteye bildirilmiş"
    // saymıyorsa bu erken bir denemedir: işaret yazılmaz, yanlış "iade
    // başarısız" alarmı gitmez, satır geri bırakılır (drainer backoff'uyla
    // yeniden dener). SON denemede erteleme yapılmaz: iş olağan yoldan
    // `refundFailureReason` + retry cron'una devredilir, para asla askıda
    // kalmaz. Diğer sağlayıcı hataları da aynı işarete düşer. Servis yoksa
    // fırlatılır ki satır kaybolmasın.
    this.registry.register(
      OUTBOX_TRADE_CANCELLED_PAYMENT_REFUND,
      async (payload, event) => {
        const { tradeId, payerId } =
          payload as TradeCancelledPaymentRefundPayload;
        if (!this.paymentRefund) {
          throw new Error("PaymentRefundService is not available");
        }
        const lastAttempt = event.attempts + 1 >= event.maxAttempts;
        const result = await this.paymentRefund.refundTradeCashTracked(
          tradeId,
          { payerId, deferIfNotYetSynced: !lastAttempt },
        );
        if (result.deferred) {
          throw new Error(
            `trade ${tradeId}: PayTR has not reported payer ${payerId}'s payment yet; refund re-queued`,
          );
        }
      },
    );

    this.registry.register(OUTBOX_SHIPMENT_CANCEL, async (payload) => {
      const { orderId, orderNumber } = payload as ShipmentCancelPayload;
      const result = await this.paymentCommon.cancelSuratShipmentIfExists(
        orderId,
        orderNumber ?? orderId,
      );
      if (!result.ok) {
        throw new Error(
          `Shipment local cancellation failed for ${orderId}: ${result.error ?? "unknown error"}`,
        );
      }
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
      // Ters kayıttan SONRA: kusurluya yüklenen kargo bedelinin belgesi. Ters
      // kayıt önce çalışmalı ki iade faturaları ile ceza aynı sıraya girsin.
      // İdempotent (type+sourceId) ve `cut` hatayı yutar — iadeyi bloklamaz.
      const refundRequestId = await this.resolveRefundRequestId(
        adjustment.refundAttemptId,
      );
      if (refundRequestId) {
        await this.elogoInvoicing.issuePenaltyInvoice(refundRequestId);
      }
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
      const { orderId, membershipPaymentId, kind } =
        payload as RevenueInvoiceIssuePayload;
      if (kind === "membership" && membershipPaymentId) {
        await this.elogoInvoicing.issueMembershipInvoice(membershipPaymentId);
        return;
      }
      if (!orderId) throw new Error("Revenue invoice source is missing");
      await this.elogoInvoicing.issueVirtualOrderInvoice(orderId, kind);
    });

    // Teslim edilen fiziksel siparişin gelir faturaları. Teslim tx'iyle atomik
    // yazıldığı için kargo poll'u teslimatı işaretlediği anda fatura görevi de
    // kalıcıdır — 2 dakikalık backfill cron'una tek bağımlılık kalkar (e-Arşiv'in
    // 7 günlük süresi cron gecikmesine emanet edilmez). issue* idempotenttir.
    this.registry.register(OUTBOX_ORDER_REVENUE_INVOICE, async (payload) => {
      const { orderId } = payload as OrderRevenueInvoicePayload;
      if (!orderId) throw new Error("Order revenue invoice source is missing");
      await this.elogoInvoicing.issueOrderRevenueInvoices(orderId);
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

  /**
   * İade denemesinden TALEP kimliği — ceza faturasının kaynağı budur.
   * Kusur tarafı ve kargo yüklemeleri yalnız talebin finansal bileşenlerinde
   * durur; deneme tek başına hangi belgeyi doğuracağını bilmez.
   */
  private async resolveRefundRequestId(
    refundAttemptId: string,
  ): Promise<string | undefined> {
    const attempt = await this.prisma.refundAttempt
      .findUnique({
        where: { id: refundAttemptId },
        select: { idempotencyKey: true },
      })
      .catch(() => null);
    return refundRequestIdOf(attempt?.idempotencyKey);
  }
}
