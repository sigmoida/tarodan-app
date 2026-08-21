import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { ShippingSchedulerService } from "./shipping-scheduler.service";

/** 'scheduled' kuyruğundaki 'sync-surat-tracking' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class ShippingScheduledProcessor {
  constructor(private readonly scheduler: ShippingSchedulerService) {}

  @Process("sync-surat-tracking")
  async handleSync(job: Job) {
    return runTrackedJob(job, "sync-surat-tracking", (log) =>
      this.scheduler.runSyncSuratTracking(log),
    );
  }

  @Process("sync-surat-post-delivery")
  async handlePostDelivery(job: Job) {
    return runTrackedJob(job, "sync-surat-post-delivery", (log) =>
      this.scheduler.runSyncSuratPostDelivery(log),
    );
  }

  @Process("sync-surat-post-delivery-tail")
  async handlePostDeliveryTail(job: Job) {
    return runTrackedJob(job, "sync-surat-post-delivery-tail", (log) =>
      this.scheduler.runSyncSuratPostDeliveryTail(log),
    );
  }
}
