import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { moneyCronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { TradeService } from './trade.service';

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
    await registerRepeatableCron(this.scheduledQueue, 'trade-expired', '*/5 * * * *', moneyCronsViaBull(), this.logger);
  }

  /**
   * Her 5 dakikada bir süresi dolmuş takasları kontrol eder ve iptal eder.
   */
  @TrackedCron('*/5 * * * *')
  async handleExpiredTrades() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runHandleExpiredTrades();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
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
      const fixedShipments = await this.tradeService.reconcileMissingInboundShipments();
      log(`${fixedShipments.fixed} eksik inbound kargo telafi edildi`);
      if (fixedShipments.fixed > 0) {
        this.logger.log(`Eksik inbound kargo telafisi: ${fixedShipments.fixed} takas`);
      }
      return {
        summary: `${cancelled} iptal · ${confirmed} onay · ${fixedShipments.fixed} kargo telafi`,
        stats: { cancelled, confirmed, shipmentsFixed: fixedShipments.fixed },
      };
    } catch (error: any) {
      this.logger.error(`Error in expired trades job: ${error.message}`, error.stack);
      log(`HATA: ${error.message}`);
      return { summary: `Hata: ${error.message}`, stats: { errors: 1 } };
    }
  }
}
