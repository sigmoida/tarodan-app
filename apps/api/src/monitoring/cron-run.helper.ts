import type { Job } from "bull";
import { errorMessage } from "../common/helpers/error-message";
import { getCronTracker } from "./cron-tracker.holder";

export interface CronRunSummary {
  /** One human-readable line (NO PII: counters and states only). */
  summary?: string;
  /** Numeric stats (e.g. { due: 3, sent: 2, failed: 1 }). */
  stats?: Record<string, number>;
}

export interface CronRunResult extends CronRunSummary {
  ok: boolean;
  durationMs: number;
}

/**
 * Runs a cron job "traceably":
 *  - `log(msg)` writes to the Bull job log (dashboard **Logs** tab).
 *  - The summary fn returns (summary + stats) becomes the **returnValue**
 *    (**Data** tab).
 *  - An error is logged and rethrown: Bull marks the job failed and the
 *    **Error** tab shows it.
 *
 * PRIVACY (KVKK): nothing written to these logs carries personal data, only
 * counters and states. Nothing is stored beyond Bull/Redis.
 *
 * Phase 7.5: with Bull as the only scheduler, cron observability (the
 * in-memory `/admin/jobs` record and, for a monitored job, the Sentry cron
 * check-in), formerly fed by `@TrackedCron`, is fed to CronTracker from this
 * ONE execution path. The schedule and time zone come from the repeatable
 * job's `opts.repeat`. Without a tracker the job runs unwrapped.
 */
export async function runTrackedJob(
  job: Job,
  jobName: string,
  fn: (
    log: (msg: string) => void,
  ) => Promise<CronRunSummary | void> | CronRunSummary | void,
): Promise<CronRunResult> {
  const log = (msg: string): void => {
    // Lands in the Bull Logs tab; a logging error never breaks the job.
    void job.log(`[${jobName}] ${msg}`).catch(() => undefined);
  };

  const exec = async (): Promise<CronRunResult> => {
    const started = Date.now();
    try {
      const res = (await fn(log)) || {};
      const durationMs = Date.now() - started;
      log(`bitti (${durationMs}ms)${res.summary ? " — " + res.summary : ""}`);
      return { ok: true, durationMs, summary: res.summary, stats: res.stats };
    } catch (e) {
      log(`HATA (${Date.now() - started}ms): ${errorMessage(e)}`);
      throw e; // Bull marks the job failed and the Error tab shows the stack.
    }
  };

  // CronTracker feeds /admin/jobs and the Sentry check-ins. track() returns the
  // result and rethrows the error AS IS, so Bull still marks the job failed.
  //
  // ONLY scheduled runs are tracked: every job born of a repeatable has
  // `opts.repeat.cron`; manual or one-off jobs (test tools, the admin-release
  // fast path, a Bull Board retry) do not. A manual job in the tracker would
  // overwrite the schedule on /admin/jobs, skew the run and failure counters,
  // and make the Sentry cron monitor raise a false alarm or mask the "missed"
  // alarm of a scheduled run that really did not happen. Manual runs stay
  // visible in Bull Board (Logs / Data / Error tabs).
  const tracker = getCronTracker();
  const repeat = (job?.opts as { repeat?: { cron?: string; tz?: string } })
    ?.repeat;
  const cron = repeat?.cron;
  if (!tracker || !cron) return exec();
  return tracker.track(jobName, cron, exec, repeat?.tz);
}
