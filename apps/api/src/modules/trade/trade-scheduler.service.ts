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
      const count = await this.tradeService.autoCancelExpiredTrades();
      if (count > 0) {
        this.logger.log(`Auto-cancelled ${count} expired trade(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error in expired trades job: ${error.message}`, error.stack);
    }
  }
}
