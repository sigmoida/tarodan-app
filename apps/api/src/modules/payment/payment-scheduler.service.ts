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
   * Run every 5 minutes: release expired order reservations (10 min), then cancel expired payments.
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async handleExpiredPayments() {
    this.logger.log('Checking for expired reservations and payments...');

    try {
      const released = await this.paymentService.releaseExpiredOrderReservations();
      if (released.count > 0) {
        this.logger.log(`Released ${released.count} expired order reservation(s)`);
      }
      const result = await this.paymentService.cancelExpiredPayments();
      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} expired payment(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error in expired payments job: ${error.message}`, error.stack);
    }
  }

  /**
   * Run every hour: release payment holds whose releaseAt date has passed
   */
  @Cron('0 * * * *') // Every hour at minute 0
  async handleReleaseHoldsDue() {
    this.logger.log('Checking for payment holds due for release...');

    try {
      const result = await this.paymentService.releaseHoldsDue();
      if (result.count > 0) {
        this.logger.log(`Released ${result.count} payment hold(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error releasing payment holds: ${error.message}`, error.stack);
    }
  }
}
