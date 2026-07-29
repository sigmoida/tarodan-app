import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { SearchService } from "./search.service";

/** 'scheduled' kuyruğundaki 'search-periodic-sync' işini çalıştırır (ES↔DB delta sync). */
@Processor(QUEUE_NAMES.SCHEDULED)
export class SearchScheduledProcessor {
  constructor(private readonly search: SearchService) {}

  @Process("search-periodic-sync")
  async handle(job: Job) {
    return runTrackedJob(job, "search-periodic-sync", (log) =>
      this.search.runHandlePeriodicSync(log),
    );
  }

  @Process("search-hourly-reconcile")
  async handleHourly(job: Job) {
    return runTrackedJob(job, "search-hourly-reconcile", (log) =>
      this.search.runHourlyReconcile(log),
    );
  }
}
