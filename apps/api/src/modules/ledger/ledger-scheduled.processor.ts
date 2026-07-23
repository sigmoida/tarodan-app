import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { runTrackedJob } from "../../monitoring/cron-run.helper";
import { LedgerReconciliationService } from "./ledger-reconciliation.service";

/**
 * 'scheduled' kuyruğundaki günlük ledger drift reconciliation (Faz 7).
 * MONEY_CRONS_VIA_BULL=true iken in-process cron yerine bu çalışır.
 */
@Processor(QUEUE_NAMES.SCHEDULED)
export class LedgerScheduledProcessor {
  constructor(private readonly reconciliation: LedgerReconciliationService) {}

  @Process("ledger-reconcile")
  async handleReconcile(job: Job) {
    return runTrackedJob(job, "ledger-reconcile", async (log) => {
      const r = await this.reconciliation.reconcile(log);
      return {
        summary: `${r.ledgerGroupsChecked} grup · ${r.unbalancedGroups} dengesiz · ${r.overRefundedPayments} fazla-iade`,
        stats: {
          groups: r.ledgerGroupsChecked,
          unbalanced: r.unbalancedGroups,
          overRefunded: r.overRefundedPayments,
        },
      };
    });
  }
}
