import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { NetsisAccountingSchedulerService } from "./netsis-accounting-scheduler.service";

/**
 * 'scheduled' kuyruğundaki Netsis muhasebe senkronu işi. Yalnız worker rolünde
 * kayıtlıdır (`scheduledProcessors`): Netsis'e yazma HTTP sürecinde koşmaz.
 * `runTrackedJob` koşu kaydını ve Sentry check-in'ini yazar.
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class NetsisAccountingScheduledProcessor {
  constructor(private readonly scheduler: NetsisAccountingSchedulerService) {}

  @Process("netsis-accounting-retry")
  async handleRetry(job: Job) {
    return runTrackedJob(job, "netsis-accounting-retry", (log) =>
      this.scheduler.run(log),
    );
  }
}
