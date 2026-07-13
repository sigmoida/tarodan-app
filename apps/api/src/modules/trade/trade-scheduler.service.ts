import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { TradeService } from "./trade.service";

/**
 * Trade Scheduler Service
 * Otomatik olarak süresi dolmuş takasları iptal eder:
 * - pending + responseDeadline geçmiş → iptal
 * - accepted + shippingDeadline geçmiş → iptal (rezervasyonlar serbest bırakılır)
 */
@Injectable()
export class TradeSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(TradeSchedulerService.name);

  constructor(
    private readonly tradeService: TradeService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "trade-expired",
      "*/5 * * * *",
      this.logger,
    );
  }

  /**
   * Her 5 dakikada bir süresi dolmuş takasları kontrol eder ve iptal eder.
   */
  /** Gerçek iş — Bull processor (ve manuel tetik) buradan çağırır. */
  async runHandleExpiredTrades(log: (msg: string) => void = () => {}) {
    try {
      // 1) Cancel trades that passed their deadlines
      const cancelled = await this.tradeService.autoCancelExpiredTrades();
      log(`${cancelled} expired trades cancelled`);
      if (cancelled > 0) {
        this.logger.log(`Auto-cancelled ${cancelled} expired trade(s)`);
      }

      // 2) Auto-confirm receipts for trades past confirmationDeadline
      const confirmed = await this.tradeService.autoConfirmExpiredReceipts();
      log(`${confirmed} trade receipts confirmed (auto)`);
      if (confirmed > 0) {
        this.logger.log(`Auto-confirmed ${confirmed} expired trade receipt(s)`);
      }

      // 3) O11: eksik inbound kargo etiketlerini telafi et (para alındı ama etiket yok)
      const fixedShipments =
        await this.tradeService.reconcileMissingInboundShipments();
      log(`${fixedShipments.fixed} missing inbound shipments reconciled`);
      if (fixedShipments.fixed > 0) {
        this.logger.log(
          `Eksik inbound kargo telafisi: ${fixedShipments.fixed} takas`,
        );
      }
      return {
        summary: `${cancelled} cancelled · ${confirmed} confirmed · ${fixedShipments.fixed} shipments reconciled`,
        stats: { cancelled, confirmed, shipmentsFixed: fixedShipments.fixed },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in expired trades job: ${error.message}`,
        error.stack,
      );
      log(`ERROR: ${error.message}`);
      return { summary: `Error: ${error.message}`, stats: { errors: 1 } };
    }
  }
}
