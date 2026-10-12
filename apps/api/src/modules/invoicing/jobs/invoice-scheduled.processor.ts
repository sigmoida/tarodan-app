import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { InvoiceSchedulerService } from "./invoice-scheduler.service";

/**
 * 'scheduled' kuyruğundaki e-belge retry işi (Faz 7.1). CRONS_VIA_BULL=true iken
 * in-process cron yerine bu çalışır. İş adı cron kataloğundaki kimliktir; eski
 * adıyla kalır (bkz. workers/cron-catalog.ts).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class InvoiceScheduledProcessor {
  constructor(private readonly scheduler: InvoiceSchedulerService) {}

  @Process("elogo-retry-pending")
  async handleRetry(job: Job) {
    return runTrackedJob(job, "elogo-retry-pending", (log) =>
      this.scheduler.runRetryPending(log),
    );
  }
}
