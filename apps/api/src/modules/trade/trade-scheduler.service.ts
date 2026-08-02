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
   * Gerçek iş — Bull processor 'trade-expired' buradan çağırır.
   */
  async runHandleExpiredTrades(log: (msg: string) => void = () => {}) {
    try {
      // 1) Cancel trades that passed their deadlines
      const cancelled = await this.tradeService.autoCancelExpiredTrades();
      log(`${cancelled} süresi dolmuş takas iptal edildi`);
      if (cancelled > 0) {
        this.logger.log(`Auto-cancelled ${cancelled} expired trade(s)`);
      }

      // 2) Auto-confirm receipts for trades past confirmationDeadline
      const confirmed = await this.tradeService.autoConfirmExpiredReceipts();
      log(`${confirmed} takas teslim alındı (oto-onay)`);
      if (confirmed > 0) {
        this.logger.log(`Auto-confirmed ${confirmed} expired trade receipt(s)`);
      }

      // 3) O11: eksik inbound kargo etiketlerini telafi et (para alındı ama etiket yok)
      const fixedShipments =
        await this.tradeService.reconcileMissingInboundShipments();
      log(`${fixedShipments.fixed} eksik inbound kargo telafi edildi`);
      if (fixedShipments.fixed > 0) {
        this.logger.log(
          `Eksik inbound kargo telafisi: ${fixedShipments.fixed} takas`,
        );
      }

      // 4) MONEY-H2: iade PayTR'da patlayıp refundFailureReason marker'ı yazılmış
      // takasları yeniden dene (cancelTrade/resolveDispute/reject sonrası takılan para).
      const refundRetries = await this.tradeService.retryFailedTradeRefunds();
      log(
        `${refundRetries.retried} başarısız takas iadesi denendi (${refundRetries.recovered} toparlandı)`,
      );
      if (refundRetries.recovered > 0) {
        this.logger.log(
          `Takas iade süpürmesi: ${refundRetries.recovered}/${refundRetries.retried} toparlandı`,
        );
      }

      return {
        summary: `${cancelled} iptal · ${confirmed} onay · ${fixedShipments.fixed} kargo telafi · ${refundRetries.recovered} iade toparlandı`,
        stats: {
          cancelled,
          confirmed,
          shipmentsFixed: fixedShipments.fixed,
          refundsRecovered: refundRetries.recovered,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Error in expired trades job: ${error.message}`,
        error.stack,
      );
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }
}
