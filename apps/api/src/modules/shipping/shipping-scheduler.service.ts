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
  }
}
