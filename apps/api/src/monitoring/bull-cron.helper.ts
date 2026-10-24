import { Logger } from "@nestjs/common";
import type { Queue } from "bull";
import { errorMessage } from "../common/helpers/error-message";
import { TR_TIME_ZONE } from "../common/helpers/tr-calendar";

/**
 * Bull repeatable registration helper for scheduled jobs.
 *
 * Phase 7.5: the in-process cron twins and the migration flags
 * (CRONS_VIA_BULL / MONEY_CRONS_VIA_BULL) are gone. Bull is now the ONLY
 * scheduler: every cron is registered as a repeatable in `onModuleInit`,
 * unconditionally.
 */

/**
 * SYNCS a cron's Bull repeatable (self-healing): first removes the existing
 * repeatables with the same name (so restarts do not multiply them), then
 * registers it again. A registration error is logged and rethrown: an
 * instance on which the cron never came into being must not look ready for
 * production traffic.
 */
export async function registerRepeatableCron(
  queue: Queue,
  jobName: string,
  cron: string,
  logger: Logger,
): Promise<void> {
  try {
    const existing = await queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === jobName) {
        await queue.removeRepeatableByKey(r.key);
      }
    }
    await queue.add(
      jobName,
      {},
      {
        // Containers set no TZ (UTC): without tz every hour shifts by +3, so a
        // "09:00" send would go out at noon and the night maintenance would
        // run in the morning. The time zone also reaches the Sentry cron
        // monitor through `job.opts.repeat.tz` (runTrackedJob).
        repeat: { cron, tz: TR_TIME_ZONE },
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    logger.log(`Bull repeatable registered: '${jobName}' (${cron}).`);
  } catch (e) {
    logger.error(
      `Bull repeatable sync failed ('${jobName}'): ${errorMessage(e)}`,
    );
    throw e;
  }
}
