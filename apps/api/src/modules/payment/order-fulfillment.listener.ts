import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { OutboxStatus } from "@prisma/client";
import { FulfillmentFinalizer } from "./fulfillment-finalizer.service";
import {
  ORDER_FULFILLMENT_REQUESTED,
  OrderFulfillmentRequestedPayload,
} from "../events/event.service";
import { PrismaService } from "../../prisma";
import { OUTBOX_ORDER_FULFILLMENT } from "../outbox/outbox.types";

/**
 * OrderFulfillmentListener (Faz 8.1) — event-driven fulfillment sonlandırması.
 *
 * Ödeme başarı akışı, para tx'i (claim + preparing + stok + escrow hold) commit olduktan
 * SONRA `order.fulfillment-requested` yayar; bu dinleyici fiziksel siparişin POST-COMMIT
 * sonlandırmasını (ledger capture + order.paid + Sürat gönderi) FulfillmentFinalizer'a
 * devreder. Böylece PaymentFulfillmentService fulfillment ayrıntısına DOĞRUDAN bağlı
 * kalmaz (DIP) ve tekil↔grup yolu aynı seam'i paylaşır (DRY).
 *
 * Ödeme zaten commit'lidir; hata kullanıcı akışına taşınmaz. Kargo persist hatası
 * finalizer'dan gelir ve burada outbox satırı pending bırakılarak retry edilir.
 *
 * #8 (dayanıklılık): ödeme tx'i AYNI ZAMANDA bir `order.fulfillment_requested` outbox
 * satırı yazdı (backstop). Bu anlık yol BAŞARIRSA satırı `completed` işaretleriz →
 * drainer backstop'u ÇALIŞTIRMAZ (çift ledger/mail/kargo yok). Anlık yol çökme
 * penceresinde hiç koşmazsa satır `pending` kalır → drainer sonlandırmayı tamamlar.
 */
@Injectable()
export class OrderFulfillmentListener {
  private readonly logger = new Logger(OrderFulfillmentListener.name);

  constructor(
    private readonly finalizer: FulfillmentFinalizer,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(ORDER_FULFILLMENT_REQUESTED, { async: true })
  async handle(payload: OrderFulfillmentRequestedPayload): Promise<void> {
    try {
      await this.finalizer.finalizePaidOrder(payload.order, payload.payment, {
        skipBuyer: payload.skipBuyer,
        transactionId: payload.transactionId,
      });
      // Anlık yol tamamlandı → backstop'u bastır (yalnız hâlâ `pending` satırı kapat;
      // drainer bir yarışta `processing`'e almışsa ona dokunma — sahibi o).
      await this.suppressBackstop(payload.order?.id);
    } catch (e: any) {
      // Sonlandırma hata verdiyse outbox satırı `pending` BIRAKILIR → drainer retry eder.
      this.logger.error(
        `Order fulfillment finalize failed (order ${payload.order?.id}): ${e?.message}`,
      );
    }
  }

  private async suppressBackstop(orderId?: string): Promise<void> {
    if (!orderId) return;
    try {
      await this.prisma.outboxEvent.updateMany({
        where: {
          dedupeKey: `${OUTBOX_ORDER_FULFILLMENT}:${orderId}`,
          status: OutboxStatus.pending,
        },
        data: { status: OutboxStatus.completed, processedAt: new Date() },
      });
    } catch (e: any) {
      // Bastırma başarısızsa en fazla drainer bir kez daha idempotent finalize çalıştırır.
      this.logger.warn(
        `Fulfillment backstop suppress failed (order ${orderId}): ${e?.message}`,
      );
    }
  }
}
