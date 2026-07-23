import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  OUTBOX_INVOICE_REFUND_REVERSE,
  ShipmentCancelPayload,
  InvoiceRefundReversePayload,
} from "../outbox/outbox.types";
import { PaymentCommonService } from "./payment-common.service";
import { ElogoInvoicingService } from "../elogo";

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
  }
}
