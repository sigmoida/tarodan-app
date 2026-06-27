import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TrackedCron } from '../../monitoring/tracked-cron.decorator';
import { cronsViaBull, registerRepeatableCron } from '../../monitoring/bull-cron.helper';
import { QUEUE_NAMES } from '../../workers/constants';
import { SuratTrackingService } from '../surat-cargo/surat-tracking.service';

@Injectable()
export class ShippingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ShippingSchedulerService.name);

  constructor(
    private readonly suratTracking: SuratTrackingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      'sync-surat-tracking',
      '*/30 * * * *',
      cronsViaBull(),
      this.logger,
    );
  }

  /**
   * Every 30 minutes: sync tracking status for all active Sürat shipments.
   * Flag (CRONS_VIA_BULL) açıkken iş Bull repeatable'a taşınır; in-process no-op.
   */
  @TrackedCron('*/30 * * * *')
  async syncSuratTracking() {
    if (cronsViaBull()) {
      return;
    }
    return this.runSyncSuratTracking();
  }

  /** Gerçek iş — hem in-process cron hem Bull processor buradan çağırır. */
  async runSyncSuratTracking(log: (msg: string) => void = () => {}) {
    const stats = { shipmentSynced: 0, tradeSynced: 0, refundSynced: 0, failed: 0 };

    try {
      const result = await this.suratTracking.syncAllActiveShipments();
      stats.shipmentSynced = result.synced;
      stats.failed += result.failed;
      log(`Sipariş kargo senkron: ${result.synced} güncellendi, ${result.failed} başarısız`);
      if (result.synced > 0 || result.failed > 0) {
        this.logger.log(`Sürat tracking sync: ${result.synced} synced, ${result.failed} failed`);
      }
    } catch (error: any) {
      this.logger.error(`Sürat tracking sync error: ${error.message}`);
      log(`Sipariş kargo senkron HATASI: ${error.message}`);
    }

    try {
      const tradeResult = await this.suratTracking.syncAllActiveTradeShipments();
      stats.tradeSynced = tradeResult.synced;
      stats.failed += tradeResult.failed;
      log(`Takas kargo senkron: ${tradeResult.synced} güncellendi, ${tradeResult.failed} başarısız`);
      if (tradeResult.synced > 0 || tradeResult.failed > 0) {
        this.logger.log(`Sürat trade-shipment sync: ${tradeResult.synced} synced, ${tradeResult.failed} failed`);
      }
    } catch (error: any) {
      this.logger.error(`Sürat trade-shipment sync error: ${error.message}`);
      log(`Takas kargo senkron HATASI: ${error.message}`);
    }

    try {
      const refundResult = await this.suratTracking.syncAllActiveRefundReturns();
      stats.refundSynced = refundResult.synced;
      stats.failed += refundResult.failed;
      log(`İade kargo senkron: ${refundResult.synced} güncellendi, ${refundResult.failed} başarısız`);
      if (refundResult.synced > 0 || refundResult.failed > 0) {
        this.logger.log(`Sürat refund-return sync: ${refundResult.synced} synced, ${refundResult.failed} failed`);
      }
    } catch (error: any) {
      this.logger.error(`Sürat refund-return sync error: ${error.message}`);
      log(`İade kargo senkron HATASI: ${error.message}`);
    }

    const totalSynced = stats.shipmentSynced + stats.tradeSynced + stats.refundSynced;
    return { summary: `${totalSynced} kargo güncellendi · ${stats.failed} başarısız`, stats };
  }
}
