import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { TradeSchedulerService } from "./trade-scheduler.service";

/** 'scheduled' kuyruğundaki 'trade-expired' işini çalıştırır. */
@Processor(QUEUE_NAMES.SCHEDULED)
export class TradeScheduledProcessor {
  constructor(private readonly scheduler: TradeSchedulerService) {}

  @Process("trade-expired")
  async handle(job: Job) {
    return runTrackedJob(job, "trade-expired", (log) =>
      this.scheduler.runHandleExpiredTrades(log),
    );
  }
}
