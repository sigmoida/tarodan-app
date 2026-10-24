import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import {
  SELLER_TRUST_REFRESH_JOB,
  SellerTrustSchedulerService,
} from "./seller-trust-scheduler.service";

/**
 * `seller-trust-refresh` on the `scheduled` queue: the nightly repeatable, the
 * boot-time bootstrap run and a manual trigger from admin Test Tools all land
 * here. `runTrackedJob` feeds the admin jobs page for the scheduled fire (the
 * job has no Sentry cron monitor: `monitor` in workers/cron-catalog.ts).
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class SellerTrustScheduledProcessor {
  constructor(private readonly scheduler: SellerTrustSchedulerService) {}

  @Process(SELLER_TRUST_REFRESH_JOB)
  async handleRefresh(job: Job) {
    return runTrackedJob(job, SELLER_TRUST_REFRESH_JOB, (log) =>
      this.scheduler.runRefresh(log),
    );
  }
}
