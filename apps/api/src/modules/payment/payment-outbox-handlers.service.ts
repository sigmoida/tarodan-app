import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OutboxHandlerRegistry } from "../outbox/outbox-handler.registry";
import {
  OUTBOX_SHIPMENT_CANCEL,
  ShipmentCancelPayload,
} from "../outbox/outbox.types";
import { PaymentCommonService } from "./payment-common.service";

/**
 * Ödeme/iade yan-etkilerinin outbox handler'ları. onModuleInit'te
 * OutboxHandlerRegistry'ye kaydolur; drainer bunları dispatch eder.
 *
 * KRİTİK: handler'lar İDEMPOTENT olmalı (drainer at-least-once). cancelSuratShipmentIfExists
 * zaten no-op'tur (gönderi yoksa / terminal statüdeyse), bu yüzden anlık iptal + outbox
 * backstop birlikte güvenle çalışır (çift iptal zararsız).
 */
@Injectable()
export class PaymentOutboxHandlers implements OnModuleInit {
  private readonly logger = new Logger(PaymentOutboxHandlers.name);

  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly paymentCommon: PaymentCommonService,
  ) {}

  onModuleInit(): void {
    this.registry.register(OUTBOX_SHIPMENT_CANCEL, async (payload) => {
      const { orderId, orderNumber } = payload as ShipmentCancelPayload;
      await this.paymentCommon.cancelSuratShipmentIfExists(
        orderId,
        orderNumber ?? orderId,
      );
    });
  }
}
