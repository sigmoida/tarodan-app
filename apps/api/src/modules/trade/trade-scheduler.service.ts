import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradeService } from './trade.service';

/**
 * Trade Scheduler Service
 * Otomatik olarak süresi dolmuş takasları iptal eder:
 * - pending + responseDeadline geçmiş → iptal
 * - accepted + shippingDeadline geçmiş → iptal (rezervasyonlar serbest bırakılır)
 */
@Injectable()
export class TradeSchedulerService {
  private readonly logger = new Logger(TradeSchedulerService.name);

  constructor(private readonly tradeService: TradeService) {}

  /**
   * Her 5 dakikada bir süresi dolmuş takasları kontrol eder ve iptal eder.
   */
  @Cron('*/5 * * * *')
  async handleExpiredTrades() {
    try {
      // 1) Cancel trades that passed their deadlines
      const cancelled = await this.tradeService.autoCancelExpiredTrades();
      if (cancelled > 0) {
        this.logger.log(`Auto-cancelled ${cancelled} expired trade(s)`);
      }

      // 2) Auto-confirm receipts for trades past confirmationDeadline
      const confirmed = await this.tradeService.autoConfirmExpiredReceipts();
      if (confirmed > 0) {
        this.logger.log(`Auto-confirmed ${confirmed} expired trade receipt(s)`);
      }

      // 3) O11: eksik inbound kargo etiketlerini telafi et (para alındı ama etiket yok)
      const fixedShipments = await this.tradeService.reconcileMissingInboundShipments();
      if (fixedShipments.fixed > 0) {
        this.logger.log(`Eksik inbound kargo telafisi: ${fixedShipments.fixed} takas`);
      }
    } catch (error: any) {
      this.logger.error(`Error in expired trades job: ${error.message}`, error.stack);
    }
  }
}
