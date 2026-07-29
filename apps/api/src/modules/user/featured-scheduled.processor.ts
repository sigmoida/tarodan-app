import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { FeaturedSchedulerService } from "./featured-scheduler.service";

/**
 * 'scheduled' kuyruğundaki featured snapshot yenileme işi (Faz 7.1).
 * CRONS_VIA_BULL=true iken in-process cron yerine bu çalışır.
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class FeaturedScheduledProcessor {
  constructor(private readonly scheduler: FeaturedSchedulerService) {}

  @Process("featured-refresh")
  async handleRefresh(job: Job) {
    return runTrackedJob(job, "featured-refresh", (log) =>
      this.scheduler.runDailyRefresh(log),
    );
  }
}
