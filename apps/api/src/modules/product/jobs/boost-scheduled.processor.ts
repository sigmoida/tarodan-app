import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * 'scheduled' kuyruğundaki product cron-tipi işlerini çalıştırır.
 * İş türleri: expire-boosts, update-popularity, expire-old-listings,
 * send-expiration-warnings. Gerçek mantık ProductSchedulerService'te; burada
 * yalnız ilgili run*() çağrılır. Her çalışma Bull'da gerçek job → Bull Board'da
 * detay/log/durum/retry ile görünür.
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class BoostScheduledProcessor {
  constructor(private readonly scheduler: ProductSchedulerService) {}

  @Process("expire-boosts")
  async handleExpireBoosts(job: Job) {
    return runTrackedJob(job, "expire-boosts", (log) =>
      this.scheduler.runExpireBoosts(log),
    );
  }

  @Process("update-popularity")
  async handleUpdatePopularity(job: Job) {
    return runTrackedJob(job, "update-popularity", (log) =>
      this.scheduler.runUpdatePopularityScores(log),
    );
  }

  @Process("expire-old-listings")
  async handleExpireOldListings(job: Job) {
    return runTrackedJob(job, "expire-old-listings", (log) =>
      this.scheduler.runExpireOldListings(log),
    );
  }

  @Process("send-expiration-warnings")
  async handleSendExpirationWarnings(job: Job) {
    return runTrackedJob(job, "send-expiration-warnings", (log) =>
      this.scheduler.runSendExpirationWarnings(log),
    );
  }

  @Process("pending-moderation-digest")
  async handlePendingModerationDigest(job: Job) {
    return runTrackedJob(job, "pending-moderation-digest", (log) =>
      this.scheduler.runPendingModerationDigest(log),
    );
  }
}
