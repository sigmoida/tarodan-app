import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../../workers/constants";
import { runTrackedJob } from "../../../monitoring/cron-run.helper";
import { PaymentSchedulerService } from "./payment-scheduler.service";

/** 'scheduled' kuyruğundaki payment cron işleri (reconcile / hold-release / preparing). */
@Processor(QUEUE_NAMES.SCHEDULED)
export class PaymentScheduledProcessor {
  constructor(private readonly scheduler: PaymentSchedulerService) {}

  @Process("payment-expired")
  async handleExpired(job: Job) {
    return runTrackedJob(job, "payment-expired", (log) =>
      this.scheduler.runHandleExpiredPayments(log),
    );
  }

  @Process("payment-release-holds")
  async handleReleaseHolds(job: Job) {
    return runTrackedJob(job, "payment-release-holds", (log) =>
      this.scheduler.runHandleReleaseHoldsDue(log),
    );
  }

  @Process("payment-expired-preparing")
  async handleExpiredPreparing(job: Job) {
    return runTrackedJob(job, "payment-expired-preparing", (log) =>
      this.scheduler.runHandleExpiredPreparingOrders(log),
    );
  }

  @Process("paytr-statement-sync")
  async handlePaytrStatementSync(job: Job) {
    return runTrackedJob(job, "paytr-statement-sync", (log) =>
      this.scheduler.runSyncPaytrStatement(log),
    );
  }

  @Process("paytr-settlement-sync")
  async handlePaytrSettlementSync(job: Job) {
    return runTrackedJob(job, "paytr-settlement-sync", (log) =>
      this.scheduler.runSyncPaytrSettlements(log),
    );
  }
}
