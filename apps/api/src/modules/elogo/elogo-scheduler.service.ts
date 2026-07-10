import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { TrackedCron } from "../../monitoring/tracked-cron.decorator";
import {
  cronsViaBull,
  registerRepeatableCron,
} from "../../monitoring/bull-cron.helper";
import type { CronRunSummary } from "../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoInvoicingService } from "./elogo-invoicing.service";

/** In-process cron ile Bull repeatable'ın aynı zamanlamayı paylaşması için tek kaynak. */
const ELOGO_RETRY_CRON = CronExpression.EVERY_30_MINUTES;

/**
 * eLogo gelir faturaları için retry zamanlayıcı.
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Servis kapalıysa (ELOGO_ENABLED=false) no-op.
 *
 * Dual-mode: `CRONS_VIA_BULL` açıkken iş Bull repeatable üzerinden
 * (ElogoScheduledProcessor) tek-sefer koşar; kapalıyken in-process @TrackedCron.
 */
@Injectable()
export class ElogoSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ElogoSchedulerService.name);

  constructor(
    private readonly invoicing: ElogoInvoicingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "elogo-retry-pending",
      ELOGO_RETRY_CRON,
      cronsViaBull(),
      this.logger,
    );
  }

  @TrackedCron(ELOGO_RETRY_CRON)
  async retryPending(): Promise<void> {
    if (cronsViaBull()) {
      return;
    }
    await this.runRetryPending();
  }

  /** Gerçek iş — in-process cron ve Bull processor buradan çağırır. */
  async runRetryPending(
    log: (msg: string) => void = () => {},
  ): Promise<CronRunSummary> {
    try {
      const r = await this.invoicing.retryPendingInvoices();
      if (!r.enabled) {
        log("eLogo kapalı (ELOGO_ENABLED=false), atlandı");
        return { summary: "eLogo kapalı, atlandı", stats: { skipped: 1 } };
      }
      log(
        `eLogo retry: ${r.attempted} denendi · ${r.sent} gönderildi · ${r.failed} başarısız`,
      );
      return {
        summary: `${r.attempted} denendi · ${r.sent} gönderildi · ${r.failed} başarısız`,
        stats: { attempted: r.attempted, sent: r.sent, failed: r.failed },
      };
    } catch (err: any) {
      this.logger.warn(`eLogo retry cron hatası: ${err?.message}`);
      log(`HATA: ${err?.message}`);
      return { summary: `Hata: ${err?.message}`, stats: { errors: 1 } };
    }
  }
}
