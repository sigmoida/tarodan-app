import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { moneyCronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { RefundService } from './refund.service';

@Injectable()
export class RefundSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RefundSchedulerService.name);

  constructor(
    private readonly refundService: RefundService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(this.scheduledQueue, 'refund-crons', '0 */10 * * * *', moneyCronsViaBull(), this.logger);
  }

  @TrackedCron(CronExpression.EVERY_10_MINUTES)
  async handleRefundCrons() {
    if (moneyCronsViaBull()) {
      return;
    }
    return this.runRefundCrons();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runRefundCrons(log: (msg: string) => void = () => {}) {
    const opened = await this.openReturnShipmentsForDeliveredOrders();
    log(`${opened} iade kargosu açıldı (teslim edilmiş siparişler)`);
    const accepted = await this.autoAcceptOverdueRequests();
    log(`${accepted} süresi geçen iade talebi oto-kabul edildi`);
    const finalized = await this.finalizeReturnedShipments();
    log(`${finalized} iade finalize edildi (kargo döndü)`);
    return {
      summary: `${opened} açıldı · ${accepted} oto-kabul · ${finalized} finalize`,
      stats: { opened, accepted, finalized },
    };
  }

  private async openReturnShipmentsForDeliveredOrders(): Promise<number> {
    const pending = await this.refundService.findPendingDeliveryToOpenReturn();
    if (pending.length === 0) return 0;
    this.logger.log(`Opening return shipments for ${pending.length} delivered refund request(s)`);
    for (const id of pending) {
      try {
        await this.refundService.openReturnShipment(id);
      } catch (e) {
        this.logger.error(`Failed to open return shipment for ${id}: ${(e as Error).message}`);
      }
    }
    return pending.length;
  }

  private async finalizeReturnedShipments(): Promise<number> {
    const pending = await this.refundService.findReturnDeliveredPendingFinalize();
    if (pending.length === 0) return 0;
    this.logger.log(`Finalizing refund for ${pending.length} returned shipment(s)`);
    for (const id of pending) {
      try {
        await this.refundService.finalizeRefundForReturnedShipment(id);
      } catch (e) {
        this.logger.error(`Failed to finalize refund ${id}: ${(e as Error).message}`);
      }
    }
    return pending.length;
  }

  private async autoAcceptOverdueRequests(): Promise<number> {
    const overdue = await this.refundService.findOverdueSellerResponses();
    if (overdue.length === 0) return 0;
    this.logger.log(`Auto-accepting ${overdue.length} overdue refund request(s)`);
    for (const id of overdue) {
      try {
        await this.refundService.autoAcceptOverdue(id);
      } catch (e) {
        this.logger.error(`Failed to auto-accept ${id}: ${(e as Error).message}`);
      }
    }
    return overdue.length;
  }
}
