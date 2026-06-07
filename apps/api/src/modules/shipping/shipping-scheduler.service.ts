import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SuratTrackingService } from '../surat-cargo/surat-tracking.service';

@Injectable()
export class ShippingSchedulerService {
  private readonly logger = new Logger(ShippingSchedulerService.name);

  constructor(private readonly suratTracking: SuratTrackingService) {}

  /**
   * Every 30 minutes: sync tracking status for all active Sürat shipments.
   */
  @Cron('*/30 * * * *')
  async syncSuratTracking() {
    try {
      const result = await this.suratTracking.syncAllActiveShipments();
      if (result.synced > 0 || result.failed > 0) {
        this.logger.log(
          `Sürat tracking sync: ${result.synced} synced, ${result.failed} failed`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Sürat tracking sync error: ${error.message}`);
    }

    try {
      const tradeResult = await this.suratTracking.syncAllActiveTradeShipments();
      if (tradeResult.synced > 0 || tradeResult.failed > 0) {
        this.logger.log(
          `Sürat trade-shipment sync: ${tradeResult.synced} synced, ${tradeResult.failed} failed`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Sürat trade-shipment sync error: ${error.message}`);
    }

    try {
      const refundResult = await this.suratTracking.syncAllActiveRefundReturns();
      if (refundResult.synced > 0 || refundResult.failed > 0) {
        this.logger.log(
          `Sürat refund-return sync: ${refundResult.synced} synced, ${refundResult.failed} failed`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Sürat refund-return sync error: ${error.message}`);
    }
  }
}
