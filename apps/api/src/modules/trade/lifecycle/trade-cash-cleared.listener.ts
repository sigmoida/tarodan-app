import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PAYMENT_TRADE_CASH_CLEARED } from "../../events/event.service";
import { TradeShipmentService } from "./trade-shipment.service";

/**
 * Faz 8.4: Payment tarafı nakit-farklı takas ödemesini temizleyince yaydığı
 * `payment.trade-cash-cleared` in-process event'ini dinler ve inbound (depoya)
 * Sürat gönderilerini oluşturur. Böylece Payment, Trade'e statik/runtime bağımlılık
 * taşımaz (eski ModuleRef + require() döngü-aşma hack'i kalktı). İdempotent + best-effort.
 */
@Injectable()
export class TradeCashClearedListener {
  private readonly logger = new Logger(TradeCashClearedListener.name);

  constructor(private readonly tradeShipment: TradeShipmentService) {}

  @OnEvent(PAYMENT_TRADE_CASH_CLEARED, { async: true })
  async handle(payload: { tradeId: string }): Promise<void> {
    try {
      await this.tradeShipment.createInboundTradeShipments(payload.tradeId);
    } catch (err: any) {
      this.logger.error(
        `createInboundTradeShipments crashed for cash-trade ${payload.tradeId}: ${err?.message ?? err}`,
      );
    }
  }
}
