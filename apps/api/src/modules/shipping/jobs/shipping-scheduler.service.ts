import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { SuratTrackingService } from "../../surat-cargo/sync/surat-tracking.service";
import {
  CronStepFailuresError,
  isAlreadyReportedCronFailure,
} from "../../../monitoring/cron-step-runner";
import { PrismaService } from "../../../prisma";
import { resolveTimingValue } from "../../../common/timing-rules";
import {
  errorMessage,
  errorStack,
} from "../../../common/helpers/error-message";

/**
 * Teslim sonrası SICAK pencere. İade orijinal etiketle dönüyorsa teslimden hemen
 * sonra başlıyor; bu sınırın ötesi günlük taramaya bırakılıyor.
 */
const POST_DELIVERY_HOT_HOURS = 48;

/**
 * Başarısız koli listesini alarm metnine sığacak hâle getirir. Alarm tek satır
 * okunuyor; hepsini basmak mesajı kullanılmaz yapar, hiçbirini basmamak da
 * teşhis edilemez (yaşanan durum buydu). İlk birkaçı + kalan sayısı.
 */
const MAX_LISTED_FAILURES = 3;
const describeFailures = (failures: string[] = []): string => {
  if (failures.length === 0) return "";
  const listed = failures.slice(0, MAX_LISTED_FAILURES).join(", ");
  const rest = failures.length - MAX_LISTED_FAILURES;
  return `: ${listed}${rest > 0 ? ` (+${rest} more)` : ""}`;
};

@Injectable()
export class ShippingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ShippingSchedulerService.name);

  constructor(
    private readonly suratTracking: SuratTrackingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "sync-surat-tracking",
      "*/30 * * * *",
      this.logger,
    );
    // Teslim sonrası izleme iki kademeli. Maliyet sıklıktan değil PENCERENİN
    // uzunluğundan geliyor: iade hakkı 14 gün, yani her teslim edilmiş koli o
    // kadar süre havuzda kalıyor. Taşıyıcı tarafında başlatılan iade orijinal
    // etiketle ve teslimin hemen ardından yürüyor (prod vakasında 74 dakika),
    // bu yüzden ilk 48 saat saatlik; geri kalan 12 gün günde bir taranıyor.
    await registerRepeatableCron(
      this.scheduledQueue,
      "sync-surat-post-delivery",
      "0 * * * *",
      this.logger,
    );
    await registerRepeatableCron(
      this.scheduledQueue,
      "sync-surat-post-delivery-tail",
      "20 4 * * *",
      this.logger,
    );
  }

  /** Sıcak pencere: son 48 saatte teslim edilmiş koliler, saatte bir. */
  async runSyncSuratPostDelivery(log: (msg: string) => void = () => {}) {
    return this.runPostDeliverySweep(
      "sync-surat-post-delivery",
      POST_DELIVERY_HOT_HOURS,
      0,
      log,
    );
  }

  /**
   * Kuyruk: 2-14 gün önce teslim edilmiş koliler, günde bir. Dış sınır iade
   * hakkı süresidir (Süreler ve Kurallar → `returnWindowDays`); ayrı sabit
   * tutulmaz.
   */
  async runSyncSuratPostDeliveryTail(log: (msg: string) => void = () => {}) {
    const returnWindowDays = await resolveTimingValue(
      this.prisma,
      "returnWindowDays",
    );
    return this.runPostDeliverySweep(
      "sync-surat-post-delivery-tail",
      returnWindowDays * 24,
      POST_DELIVERY_HOT_HOURS,
      log,
    );
  }

  private async runPostDeliverySweep(
    step: string,
    fromHoursAgo: number,
    toHoursAgo: number,
    log: (msg: string) => void,
  ) {
    // No try/catch logging here: a failure is rethrown to the cron tracker,
    // which reports it once with its stack (a log here made it two events).
    const result = await this.suratTracking.syncPostDeliveryShipments(
      fromHoursAgo,
      toHoursAgo,
    );
    const summary =
      `Teslim sonrası kargo senkron (${fromHoursAgo}s-${toHoursAgo}s): ` +
      `${result.synced} güncellendi, ${result.pending} beklemede, ${result.failed} başarısız`;
    log(summary);
    if (result.failed > 0) {
      throw new CronStepFailuresError(
        [step],
        [
          `${step}: ${result.failed} kayıt senkronlanamadı${describeFailures(result.failures)}`,
        ],
      );
    }
    // `stats` sayısal telemetri (Record<string, number>); failures metinsel
    // teşhis bilgisi ve yeri alarm mesajı — ikisi karışmasın.
    const { failures: _failures, ...counts } = result;
    return { summary, stats: counts };
  }

  /**
   * Every 30 minutes: sync tracking status for all active Sürat shipments.
   * Gerçek iş — Bull processor 'sync-surat-tracking' buradan çağırır.
   */
  async runSyncSuratTracking(log: (msg: string) => void = () => {}) {
    const failedSteps: string[] = [];
    const failureDetails: string[] = [];
    // A step that threw logged its own error below; a "-records" step only
    // counted per-record warnings, so the run summary is its one alarm. The
    // summary stays an error unless every failure was already reported.
    let everyFailureReported = true;
    const recordStepFailure = (
      step: string,
      error: unknown,
      reported: boolean,
    ) => {
      const message = errorMessage(error);
      failedSteps.push(step);
      failureDetails.push(`${step}: ${message}`);
      if (!reported) everyFailureReported = false;
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
        // Name the records and the reason in the alarm text: "N records could
        // not be completed" alone cannot be diagnosed.
        recordStepFailure(
          "barcode-retry-records",
          new Error(
            `${stats.barcodeRetryFailed} records could not be completed${describeFailures(
              [...retry.order.failures, ...retry.trade.failures],
            )}`,
          ),
          false,
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
    } catch (error: unknown) {
      const message = recordStepFailure("barcode-retry", error, true);
      // BarcodeRetryService already logged each failed step at error.
      if (isAlreadyReportedCronFailure(error)) {
        this.logger.warn(`Surat barcode retry error: ${message}`);
      } else {
        this.logger.error(
          `Surat barcode retry error: ${message}`,
          errorStack(error),
        );
      }
      log(`Kargo kodu retry HATASI: ${message}`);
    }

    try {
      const result = await this.suratTracking.syncAllActiveShipments();
      stats.shipmentSynced = result.synced;
      stats.shipmentPending = result.pending;
      stats.failed += result.failed;
      if (result.failed > 0) {
        // Sebebi alarmın METNİNE koy: bu Sentry olayı 30 dakikada bir tekrar
        // ediyordu ve hangi koli, neden başarısız hiçbir yerde yazmıyordu.
        recordStepFailure(
          "order-tracking-records",
          new Error(
            `${result.failed} kayıt senkronlanamadı${describeFailures(result.failures)}`,
          ),
          false,
        );
      }
      log(
        `Sipariş kargo senkron: ${result.synced} güncellendi, ${result.pending} kabul bekliyor, ` +
          `${result.skipped} atlandı (taşıyıcı kodu geriye sardı), ${result.failed} başarısız`,
      );
      if (result.synced > 0 || result.failed > 0) {
        this.logger.log(
          `Sürat tracking sync: ${result.synced} synced, ${result.failed} failed`,
        );
      }
    } catch (error: unknown) {
      const message = recordStepFailure("order-tracking", error, true);
      this.logger.error(
        `Sürat tracking sync error: ${message}`,
        errorStack(error),
      );
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
          new Error(
            `${tradeResult.failed} kayıt senkronlanamadı${describeFailures(tradeResult.failures)}`,
          ),
          false,
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
    } catch (error: unknown) {
      const message = recordStepFailure("trade-tracking", error, true);
      this.logger.error(
        `Sürat trade-shipment sync error: ${message}`,
        errorStack(error),
      );
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
          new Error(
            `${refundResult.failed} kayıt senkronlanamadı${describeFailures(refundResult.failures)}`,
          ),
          false,
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
    } catch (error: unknown) {
      const message = recordStepFailure("refund-tracking", error, true);
      this.logger.error(
        `Sürat refund-return sync error: ${message}`,
        errorStack(error),
      );
      log(`İade kargo senkron HATASI: ${message}`);
    }

    // İnsani senaryolar (A9 ghost-pickup, B15/D27 kayıp şüphesi): bayat kargo
    // alarmları — kayıt başına haftada bir, log-tabanlı uyarı kanalına.
    try {
      await this.suratTracking.alertStaleCargo();
    } catch (error: unknown) {
      const message = recordStepFailure("stale-cargo-alert", error, true);
      this.logger.error(
        `Stale cargo alert error: ${message}`,
        errorStack(error),
      );
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
      throw new CronStepFailuresError(
        failedSteps,
        failureDetails,
        everyFailureReported,
      );
    }
    return {
      summary: `${totalSynced} kargo güncellendi · ${totalPending} kabul bekliyor · ${stats.failed} başarısız${retrySummary}`,
      stats,
    };
  }
}
