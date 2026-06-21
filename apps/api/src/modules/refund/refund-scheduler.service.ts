import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefundService } from './refund.service';

@Injectable()
export class RefundSchedulerService {
  private readonly logger = new Logger(RefundSchedulerService.name);

  constructor(private readonly refundService: RefundService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleRefundCrons() {
    await this.openReturnShipmentsForDeliveredOrders();
    await this.autoAcceptOverdueRequests();
    await this.finalizeReturnedShipments();
  }

  private async openReturnShipmentsForDeliveredOrders() {
    const pending = await this.refundService.findPendingDeliveryToOpenReturn();
    if (pending.length === 0) return;
    this.logger.log(`Opening return shipments for ${pending.length} delivered refund request(s)`);
    for (const id of pending) {
      try {
        await this.refundService.openReturnShipment(id);
      } catch (e) {
        this.logger.error(`Failed to open return shipment for ${id}: ${(e as Error).message}`);
      }
    }
  }

  private async finalizeReturnedShipments() {
    const pending = await this.refundService.findReturnDeliveredPendingFinalize();
    if (pending.length === 0) return;
    this.logger.log(`Finalizing refund for ${pending.length} returned shipment(s)`);
    for (const id of pending) {
      try {
        await this.refundService.finalizeRefundForReturnedShipment(id);
      } catch (e) {
        this.logger.error(`Failed to finalize refund ${id}: ${(e as Error).message}`);
      }
    }
  }

  private async autoAcceptOverdueRequests() {
    const overdue = await this.refundService.findOverdueSellerResponses();
    if (overdue.length === 0) return;
    this.logger.log(`Auto-accepting ${overdue.length} overdue refund request(s)`);
    for (const id of overdue) {
      try {
        await this.refundService.autoAcceptOverdue(id);
      } catch (e) {
        this.logger.error(`Failed to auto-accept ${id}: ${(e as Error).message}`);
      }
    }
  }
}
