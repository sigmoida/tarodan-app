import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PayoutService } from './payout.service';

@Injectable()
export class PayoutSchedulerService {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(private readonly payoutService: PayoutService) {}

  /**
   * Every 15 minutes: process pending payouts via PayTR Platform Transfer.
   */
  @Cron('*/15 * * * *')
  async handleProcessPayouts() {
    try {
      // 1) Move retry_pending → pending if nextRetryAt has passed
      const retried = await this.payoutService.processRetryPayouts();
      if (retried > 0) {
        this.logger.log(`Moved ${retried} payout(s) from retry_pending to pending`);
      }

      // 2) Process all pending payouts
      const result = await this.payoutService.processPendingPayouts();
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Payout processing: ${result.processed} completed, ${result.failed} failed`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Payout processing error: ${error.message}`);
    }
  }

  /**
   * Daily at 06:00: check for returned transfers from PayTR.
   */
  @Cron('0 6 * * *')
  async handleCheckReturnedTransfers() {
    try {
      const returned = await this.payoutService.checkReturnedTransfers();
      if (returned > 0) {
        this.logger.warn(`Found ${returned} returned payout transfer(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Returned transfer check error: ${error.message}`);
    }
  }
}
