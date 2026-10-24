import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { errorMessage } from "../../../common/helpers/error-message";
import { registerRepeatableCron } from "../../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../../workers/constants";
import { InvoicingService } from "../invoicing.service";

/**
 * Retry scheduler for revenue e-documents (provider-independent).
 * Periodically resends the records left pending/failed (same number/ETTN).
 * A no-op while the provider is off (eLogo: ELOGO_ENABLED=false).
 *
 * Phase 7.5: Bull is the only scheduler (the 'elogo-retry-pending' repeatable).
 * The cron id keeps its old name: the Bull repeatable key and the run history
 * are bound to it, so renaming it is an ops step (see workers/cron-catalog.ts).
 */
@Injectable()
export class InvoiceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(InvoiceSchedulerService.name);

  constructor(
    private readonly invoicing: InvoicingService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableCron(
      this.scheduledQueue,
      "elogo-retry-pending",
      "*/30 * * * *",
      this.logger,
    );
  }

  /** The actual work: the Bull processor 'elogo-retry-pending' calls this. */
  async runRetryPending(log: (msg: string) => void = () => undefined) {
    try {
      await this.invoicing.retryPendingInvoices();
      // Invoices with an exhausted attempt budget are not recovered by
      // themselves and must be visible (the legal deadline runs). The admin
      // retry endpoint recovers them.
      const exhausted = await this.invoicing.reportExhaustedInvoices();
      log(
        `eLogo retry çalıştı${exhausted > 0 ? ` · ${exhausted} fatura deneme bütçesi tükenmiş` : ""}`,
      );
      return {
        summary: `eLogo retry tamam${exhausted > 0 ? ` · ${exhausted} tükenmiş` : ""}`,
        stats: { exhausted } as Record<string, number>,
      };
    } catch (err) {
      this.logger.warn(`eLogo retry cron failed: ${errorMessage(err)}`);
      log(`FAILED: ${errorMessage(err)}`);
      // Rethrow, do not swallow: the Bull job must fail so attempts/backoff and
      // the cron tracker's failure alarm really apply (otherwise even a failed
      // run looks successful and the error stays in a log line).
      throw err;
    }
  }
}
