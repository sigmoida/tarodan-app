import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from './payment.service';

/**
 * Payment Scheduler Service
 * Automatically cancels expired pending payments
 */
@Injectable()
export class PaymentSchedulerService {
  private readonly logger = new Logger(PaymentSchedulerService.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Run every 5 minutes to check for expired payments
   * Cancels pending payments older than 15 minutes
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async handleExpiredPayments() {
    this.logger.log('Checking for expired payments...');

    try {
      const result = await this.paymentService.cancelExpiredPayments();
      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} expired payment(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error cancelling expired payments: ${error.message}`, error.stack);
    }
  }
}
