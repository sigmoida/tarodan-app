import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from './payment.service';
import { ProductLockService } from '../product/product-lock.service';
import { EventService } from '../events/event.service';
import { PayoutService } from '../payout/payout.service';

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
    @Optional() private readonly payoutService?: PayoutService,
  ) {}

  /**
   * Run every 5 minutes: release expired order reservations, cancel expired
   * payments, then sweep any quantity=0 products to ensure pending offers/trades
   * are cancelled.
   */
  /**
   * Run a single scheduler step in isolation. A failure in one step (ör. eksik
   * migration nedeniyle bir tablo/kolon yoksa) DİĞER adımları bloklamamalı —
   * aksi halde örn. reconcilePendingPaytrPayments patlayınca
   * releaseExpiredOrderReservations hiç çalışmaz ve rezervasyonlar takılı kalır.
   */
  private async runStep(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error: any) {
      this.logger.error(`Step "${name}" failed: ${error.message}`, error.stack);
    }
  }

  @Cron('*/5 * * * *') // Every 5 minutes
  async handleExpiredPayments() {
    this.logger.log('Checking for expired reservations and payments...');

    await this.runStep('reconcilePendingPaytrPayments', async () => {
      const reconcile = await this.paymentService.reconcilePendingPaytrPayments();
      if (reconcile.completed > 0) {
        this.logger.log(
          `PayTR reconcile: completed ${reconcile.completed} of ${reconcile.checked} checked payment(s)`,
        );
      }
    });

    await this.runStep('releaseExpiredOrderReservations', async () => {
      const released = await this.paymentService.releaseExpiredOrderReservations();
      if (released.count > 0) {
        this.logger.log(`Released ${released.count} expired order reservation(s)`);
      }
    });

    await this.runStep('reconcileReservedQuantities', async () => {
      const recon = await this.paymentService.reconcileReservedQuantities();
      if (recon.count > 0) {
        this.logger.log(`Reconciled reservedQuantity drift on ${recon.count} product(s)`);
      }
    });

    await this.runStep('expireUnpaidOrders', async () => {
      const expired = await this.paymentService.expireUnpaidOrders();
      if (expired.count > 0) {
        this.logger.log(`Expired ${expired.count} unpaid order(s) past 24h TTL`);
      }
    });

    await this.runStep('cancelExpiredPayments', async () => {
      const result = await this.paymentService.cancelExpiredPayments();
      if (result.count > 0) {
        this.logger.log(`Cancelled ${result.count} expired payment(s)`);
      }
    });

    // Safety net: sweep out-of-stock products and cancel lingering offers/trades
    await this.runStep('sweepOutOfStockProducts', async () => {
      const sweepResult = await this.productLockService.sweepOutOfStockProducts();
      if (sweepResult.offersCancelled > 0 || sweepResult.tradesCancelled > 0) {
        this.logger.log(
          `Stock sweep: cancelled ${sweepResult.offersCancelled} offer(s) and ${sweepResult.tradesCancelled} trade(s) across ${sweepResult.productsScanned} out-of-stock product(s)`,
        );

        const cancelReason = 'Stok tükendiği için otomatik iptal edildi';

        // NOT (mükerrer bildirim fix): İptal edilen TEKLİFLER zaten
        // sweepOutOfStockProducts() içinde notifyOfferCancelledOutOfStock()
        // (IN_APP + PUSH) ile bildiriliyor. Burada ayrıca emitOfferAutoRejected()
        // çağırmak aynı teklif için İKİNCİ bir bildirim üretiyordu (çift). Teklif
        // emit'i kaldırıldı; yalnız TAKAS bildirimi burada gönderiliyor (sweep
        // takasları bildirmez).
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
    });
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

      // Create PayoutTransfer records for newly released holds
      if (this.payoutService && (result.count > 0 || result.tradeCashReleased > 0)) {
        const payoutsCreated = await this.payoutService.createPayoutsForReleasedHolds();
        if (payoutsCreated > 0) {
          this.logger.log(`Created ${payoutsCreated} payout transfer(s) for released holds`);
        }
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
