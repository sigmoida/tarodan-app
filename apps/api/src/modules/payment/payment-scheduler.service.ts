import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from './payment.service';
import { ProductLockService } from '../product/product-lock.service';
import { EventService } from '../events/event.service';

/**
 * Payment Scheduler Service
 * Automatically cancels expired pending payments and sweeps out-of-stock products.
 */
@Injectable()
export class PaymentSchedulerService {
  private readonly logger = new Logger(PaymentSchedulerService.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly productLockService: ProductLockService,
    private readonly eventService: EventService,
  ) {}

  /**
   * Run every 5 minutes: release expired order reservations, cancel expired
   * payments, then sweep any quantity=0 products to ensure pending offers/trades
   * are cancelled.
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async handleExpiredPayments() {
    this.logger.log('Checking for expired reservations and payments...');

    try {
      const reconcile = await this.paymentService.reconcilePendingPaytrPayments();
      if (reconcile.completed > 0) {
        this.logger.log(
          `PayTR reconcile: completed ${reconcile.completed} of ${reconcile.checked} checked payment(s)`,
        );
      }
      const released = await this.paymentService.releaseExpiredOrderReservations();
      if (released.count > 0) {
        this.logger.log(`Released ${released.count} expired order reservation(s)`);
      }
      const result = await this.paymentService.cancelExpiredPayments();
      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} expired payment(s)`);
      }

      // Safety net: sweep out-of-stock products and cancel lingering offers/trades
      const sweepResult = await this.productLockService.sweepOutOfStockProducts();
      if (sweepResult.offersCancelled > 0 || sweepResult.tradesCancelled > 0) {
        this.logger.log(
          `Stock sweep: cancelled ${sweepResult.offersCancelled} offer(s) and ${sweepResult.tradesCancelled} trade(s) across ${sweepResult.productsScanned} out-of-stock product(s)`,
        );

        const cancelReason = 'Stok tükendiği için otomatik iptal edildi';

        for (const offer of sweepResult.rejectedOffers) {
          try {
            await this.eventService.emitOfferAutoRejected({
              offerId: offer.offerId,
              buyerId: offer.buyerId,
              productId: offer.productId,
              productTitle: offer.productTitle,
              reason: cancelReason,
            });
          } catch (err: any) {
            this.logger.error(`Failed to notify offer ${offer.offerId}: ${err.message}`);
          }
        }

        for (const trade of sweepResult.cancelledTrades) {
          try {
            await this.eventService.emitTradeAutoCancelled({
              tradeId: trade.tradeId,
              initiatorId: trade.initiatorId,
              receiverId: trade.receiverId,
              reason: cancelReason,
            });
          } catch (err: any) {
            this.logger.error(`Failed to notify trade ${trade.tradeId}: ${err.message}`);
          }
        }
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
      if (result.tradeCashReleased > 0) {
        this.logger.log(`Released ${result.tradeCashReleased} trade cash payment(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error releasing payment holds: ${error.message}`, error.stack);
    }
  }

  /**
   * Run every 30 minutes: check for orders stuck in "preparing" past deadline.
   * Warns sellers 24h before deadline, auto-cancels + refunds when deadline passes.
   */
  @Cron('*/30 * * * *') // Every 30 minutes
  async handleExpiredPreparingOrders() {
    this.logger.log('Checking for expired preparing orders...');

    try {
      const result = await this.paymentService.handleExpiredPreparingOrders();
      if (result.warned > 0) {
        this.logger.log(`Warned ${result.warned} seller(s) about preparing deadline`);
      }
      if (result.cancelled > 0) {
        this.logger.log(`Auto-cancelled ${result.cancelled} order(s) past preparing deadline`);
      }
    } catch (error: any) {
      this.logger.error(`Error in expired preparing orders job: ${error.message}`, error.stack);
    }
  }
}
