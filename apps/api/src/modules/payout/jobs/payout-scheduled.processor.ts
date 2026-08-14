import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { PayoutSchedulerService } from "./payout-scheduler.service";

/**
 * 'scheduled' kuyruğundaki payout cron işleri:
 * payout-check-returned (oku) + payout-process (gerçek PayTR transfer).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class PayoutScheduledProcessor {
  constructor(private readonly scheduler: PayoutSchedulerService) {}

  @Process("payout-check-returned")
  async handleCheckReturned(job: Job) {
    return runTrackedJob(job, "payout-check-returned", (log) =>
      this.scheduler.runCheckReturnedTransfers(log),
    );
  }

  @Process("payout-process")
  async handleProcess(job: Job) {
    return runTrackedJob(job, "payout-process", (log) =>
      this.scheduler.runProcessPayouts(log),
    );
  }
}
