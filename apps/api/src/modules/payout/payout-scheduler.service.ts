import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { PayoutService } from "./payout.service";

@Injectable()
export class PayoutSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PayoutSchedulerService.name);

  constructor(
    private readonly payoutService: PayoutService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "payout-check-returned",
      "0 6 * * *",
      this.logger,
    );
    // Tier 3: gerçek PayTR transfer. Bull tek-sefer garantisi = çift-ödeme kilidi.
    await registerRepeatableCron(
      this.scheduledQueue,
      "payout-process",
      "*/15 * * * *",
      this.logger,
    );
  }

  /**
   * Every 15 minutes: process pending payouts via PayTR Platform Transfer.
   * Gerçek iş — Bull processor 'payout-process' buradan çağırır.
   */
  async runProcessPayouts(log: (msg: string) => void = () => {}) {
    try {
      // 1) Move retry_pending → pending if nextRetryAt has passed
      const retried = await this.payoutService.processRetryPayouts();
      log(`${retried} payout retry_pending → pending taşındı`);
      if (retried > 0) {
        this.logger.log(
          `Moved ${retried} payout(s) from retry_pending to pending`,
        );
      }

      // 1b) Kısmi iade nedeniyle void edilmiş payout'ları, iade sonuçlandıysa
      // geri kuyruğa al — aksi halde satıcı iade dışında kalan hakkını hiç almaz.
      const requeued = await this.payoutService.requeueRefundVoidedPayouts();
      if (requeued > 0) {
        log(`${requeued} iade-void payout yeniden kuyruğa alındı`);
        this.logger.log(
          `Requeued ${requeued} refund-voided payout(s) for remaining seller balance`,
        );
      }

      // 2) Process all pending payouts
      const result = await this.payoutService.processPendingPayouts();
      log(
        `Payout işleme: ${result.processed} tamamlandı · ${result.failed} başarısız`,
      );
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Payout processing: ${result.processed} completed, ${result.failed} failed`,
        );
      }

      // 3) Y3: 'processing'te takılı (zombie) payout'ları tespit et ve alarm ver.
      const stuck = await this.payoutService.detectStuckProcessingPayouts();
      if (stuck > 0) {
        log(`⚠ ${stuck} payout 'processing'te takılı`);
        this.logger.error(
          `${stuck} payout 'processing'te takılı — manuel inceleme gerekir`,
        );
      }
      return {
        summary: `${result.processed} işlendi · ${result.failed} başarısız${stuck ? ` · ${stuck} takılı` : ""}`,
        stats: {
          retried,
          processed: result.processed,
          failed: result.failed,
          stuck,
        },
      };
    } catch (error: any) {
      this.logger.error(`Payout processing error: ${error.message}`);
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }

  /**
   * Daily at 06:00: check for returned transfers from PayTR.
   * Gerçek iş — Bull processor 'payout-check-returned' buradan çağırır.
   */
  async runCheckReturnedTransfers(log: (msg: string) => void = () => {}) {
    try {
      const returned = await this.payoutService.checkReturnedTransfers();
      log(`${returned} iade edilen payout transferi bulundu`);
      if (returned > 0) {
        this.logger.warn(`Found ${returned} returned payout transfer(s)`);
      }
      return { summary: `${returned} iade transfer`, stats: { returned } };
    } catch (error: any) {
      this.logger.error(`Returned transfer check error: ${error.message}`);
      log(`HATA: ${error.message}`);
      // Yutmadan yükselt: Bull job'ı "failed" olsun ki attempts/backoff ve Sentry
      // Cron alarmı gerçekten devreye girsin (aksi halde başarısız tur bile
      // "başarılı" görünür ve hata yalnız log satırında kalır).
      throw error;
    }
  }
}
