import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import type { CronRunSummary } from "../../monitoring/cron-run.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { ElogoInvoicingService } from "./elogo-invoicing.service";

/** Bull repeatable kaydının zamanlaması (tek kaynak). */
const ELOGO_RETRY_CRON = CronExpression.EVERY_30_MINUTES;

/**
 * eLogo gelir faturaları için retry zamanlayıcı.
 * pending/failed kalan kayıtları periyodik olarak yeniden gönderir (aynı numara/ETTN).
 * Servis kapalıysa (ELOGO_ENABLED=false) no-op.
 *
 * İş Bull repeatable üzerinden (ElogoScheduledProcessor) worker'da tek-sefer koşar.
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
      this.logger,
    );
  }

  /** Gerçek iş — Bull processor (ve manuel tetik) buradan çağırır. */
  async runRetryPending(
    log: (msg: string) => void = () => {},
  ): Promise<CronRunSummary> {
    try {
      const r = await this.invoicing.retryPendingInvoices();
      if (!r.enabled) {
        log("eLogo disabled (ELOGO_ENABLED=false), skipped");
        return { summary: "eLogo disabled, skipped", stats: { skipped: 1 } };
      }
      log(
        `eLogo retry: ${r.attempted} attempted · ${r.sent} sent · ${r.failed} failed`,
      );
      return {
        summary: `${r.attempted} attempted · ${r.sent} sent · ${r.failed} failed`,
        stats: { attempted: r.attempted, sent: r.sent, failed: r.failed },
      };
    } catch (err: any) {
      this.logger.warn(`eLogo retry cron hatası: ${err?.message}`);
      log(`ERROR: ${err?.message}`);
      return { summary: `Error: ${err?.message}`, stats: { errors: 1 } };
    }
  }
}
