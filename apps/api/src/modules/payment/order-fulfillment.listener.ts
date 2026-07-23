import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import {
  ORDER_FULFILLMENT_REQUESTED,
  OrderFulfillmentRequestedPayload,
} from "../events/event.service";

/**
 * OrderFulfillmentListener (Faz 8.1) — event-driven fulfillment sonlandırması.
 *
 * Ödeme başarı akışı, para tx'i (claim + preparing + stok + escrow hold) commit olduktan
 * SONRA `order.fulfillment-requested` yayar; bu dinleyici fiziksel siparişin POST-COMMIT
 * sonlandırmasını (ledger capture + order.paid + Sürat gönderi) FulfillmentFinalizer'a
 * devreder. Böylece PaymentFulfillmentService fulfillment ayrıntısına DOĞRUDAN bağlı
 * kalmaz (DIP) ve tekil↔grup yolu aynı seam'i paylaşır (DRY).
 *
 * Best-effort: sonlandırma hatası burada YUTULUR — ödeme zaten commit'li, akış bozulmaz
 * (finalizer da her adımı kendi içinde try/catch'liyor; bu ikinci savunma hattı).
 */
@Injectable()
export class OrderFulfillmentListener {
  private readonly logger = new Logger(OrderFulfillmentListener.name);

  constructor(private readonly finalizer: FulfillmentFinalizer) {}

  @OnEvent(ORDER_FULFILLMENT_REQUESTED, { async: true })
  async handle(payload: OrderFulfillmentRequestedPayload): Promise<void> {
    try {
      await this.finalizer.finalizePaidOrder(payload.order, payload.payment, {
        skipBuyer: payload.skipBuyer,
        transactionId: payload.transactionId,
      });
    } catch (e: any) {
      this.logger.error(
        `Order fulfillment finalize failed (order ${payload.order?.id}): ${e?.message}`,
      );
    }
  }
}
