import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { SuratTrackingService } from "../surat-cargo/sync/surat-tracking.service";
import { CronStepFailuresError } from "../../monitoring/cron-step-runner";

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
      "sync-surat-tracking",
      "*/30 * * * *",
      this.logger,
    );
  }

  /**
   * Every 30 minutes: sync tracking status for all active Sürat shipments.
   * Gerçek iş — Bull processor 'sync-surat-tracking' buradan çağırır.
   */
  async runSyncSuratTracking(log: (msg: string) => void = () => {}) {
    const failedSteps: string[] = [];
    const failureDetails: string[] = [];
    const recordStepFailure = (step: string, error: unknown) => {
      const message = (error as Error)?.message ?? String(error);
      failedSteps.push(step);
      failureDetails.push(`${step}: ${message}`);
      return message;
    };
    const stats = {
      barcodeRetried: 0,
      barcodeRetryFailed: 0,
      shipmentSynced: 0,
      shipmentPending: 0,
      tradeSynced: 0,
      tradePending: 0,
      refundSynced: 0,
      refundPending: 0,
      failed: 0,
    };

    // Önce kodsuz kalmış kayıtlar için barkodu yeniden dene (yaş-filtreli), sonra
    // durum senkronu — böylece yeni üretilen kodların durumu aynı tick'te çekilir.
    // (Refund iade barkodunun retry'ı burada DEĞİL: openReturnShipment blocking
    // olduğundan kodsuz "surat" kaydı oluşamaz; refund-scheduler 10 dk'da bir tam
    // açılışı yeniden dener.)
    try {
      const retry = await this.suratTracking.retryPendingBarcodes();
      stats.barcodeRetried = retry.order.retried + retry.trade.retried;
      stats.barcodeRetryFailed = retry.order.failed + retry.trade.failed;
      if (stats.barcodeRetryFailed > 0) {
        recordStepFailure(
          "barcode-retry-records",
          new Error(`${stats.barcodeRetryFailed} kayıt tamamlanamadı`),
        );
      }
      if (stats.barcodeRetried > 0 || stats.barcodeRetryFailed > 0) {
        log(
          `Kargo kodu retry: ${stats.barcodeRetried} tamamlandı, ${stats.barcodeRetryFailed} başarısız`,
        );
        this.logger.log(
          `Surat barcode retry: ${stats.barcodeRetried} filled, ${stats.barcodeRetryFailed} failed ` +
            `(order ${retry.order.retried}/${retry.order.failed}, trade ${retry.trade.retried}/${retry.trade.failed})`,
        );
      }
    } catch (error: any) {
      const message = recordStepFailure("barcode-retry", error);
      this.logger.error(`Surat barcode retry error: ${message}`);
      log(`Kargo kodu retry HATASI: ${message}`);
    }

    try {
      const result = await this.suratTracking.syncAllActiveShipments();
      stats.shipmentSynced = result.synced;
      stats.shipmentPending = result.pending;
      stats.failed += result.failed;
      if (result.failed > 0) {
        recordStepFailure(
          "order-tracking-records",
          new Error(`${result.failed} kayıt senkronlanamadı`),
        );
      }
      log(
        `Sipariş kargo senkron: ${result.synced} güncellendi, ${result.pending} kabul bekliyor, ${result.failed} başarısız`,
      );
      if (result.synced > 0 || result.failed > 0) {
        this.logger.log(
          `Sürat tracking sync: ${result.synced} synced, ${result.failed} failed`,
        );
      }
    } catch (error: any) {
      const message = recordStepFailure("order-tracking", error);
      this.logger.error(`Sürat tracking sync error: ${message}`);
      log(`Sipariş kargo senkron HATASI: ${message}`);
    }

    try {
      const tradeResult =
        await this.suratTracking.syncAllActiveTradeShipments();
      stats.tradeSynced = tradeResult.synced;
      stats.tradePending = tradeResult.pending;
      stats.failed += tradeResult.failed;
      if (tradeResult.failed > 0) {
        recordStepFailure(
          "trade-tracking-records",
          new Error(`${tradeResult.failed} kayıt senkronlanamadı`),
        );
      }
      log(
        `Takas kargo senkron: ${tradeResult.synced} güncellendi, ${tradeResult.pending} kabul bekliyor, ${tradeResult.failed} başarısız`,
      );
      if (tradeResult.synced > 0 || tradeResult.failed > 0) {
        this.logger.log(
          `Sürat trade-shipment sync: ${tradeResult.synced} synced, ${tradeResult.failed} failed`,
        );
      }
    } catch (error: any) {
      const message = recordStepFailure("trade-tracking", error);
      this.logger.error(`Sürat trade-shipment sync error: ${message}`);
      log(`Takas kargo senkron HATASI: ${message}`);
    }

    try {
      const refundResult =
        await this.suratTracking.syncAllActiveRefundReturns();
      stats.refundSynced = refundResult.synced;
      stats.refundPending = refundResult.pending;
      stats.failed += refundResult.failed;
      if (refundResult.failed > 0) {
        recordStepFailure(
          "refund-tracking-records",
          new Error(`${refundResult.failed} kayıt senkronlanamadı`),
        );
      }
      log(
        `İade kargo senkron: ${refundResult.synced} güncellendi, ${refundResult.pending} kabul bekliyor, ${refundResult.failed} başarısız`,
      );
      if (refundResult.synced > 0 || refundResult.failed > 0) {
        this.logger.log(
          `Sürat refund-return sync: ${refundResult.synced} synced, ${refundResult.failed} failed`,
        );
      }
    } catch (error: any) {
      const message = recordStepFailure("refund-tracking", error);
      this.logger.error(`Sürat refund-return sync error: ${message}`);
      log(`İade kargo senkron HATASI: ${message}`);
    }

    // İnsani senaryolar (A9 ghost-pickup, B15/D27 kayıp şüphesi): bayat kargo
    // alarmları — kayıt başına haftada bir, log-tabanlı uyarı kanalına.
    try {
      await this.suratTracking.alertStaleCargo();
    } catch (error: any) {
      const message = recordStepFailure("stale-cargo-alert", error);
      this.logger.error(`Stale cargo alert error: ${message}`);
    }

    const totalSynced =
      stats.shipmentSynced + stats.tradeSynced + stats.refundSynced;
    const totalPending =
      stats.shipmentPending + stats.tradePending + stats.refundPending;
    const retrySummary =
      stats.barcodeRetried > 0
        ? ` · ${stats.barcodeRetried} kod tamamlandı`
        : "";
    if (failedSteps.length > 0) {
      throw new CronStepFailuresError(failedSteps, failureDetails);
    }
    return {
      summary: `${totalSynced} kargo güncellendi · ${totalPending} kabul bekliyor · ${stats.failed} başarısız${retrySummary}`,
      stats,
    };
  }
}
