import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { setCronTracker } from "./cron-tracker.holder";
import { errorMessage, errorStack } from "../common/helpers/error-message";
import { isAlreadyReportedCronFailure } from "./cron-step-runner";
import {
  SENTRY_REPEAT_WINDOW_SECONDS,
  buildErrorReportKey,
} from "../common/logging/error-report-key";
import { cronMonitorFor } from "../workers/cron-catalog";
import {
  type SentryMonitorConfig,
  buildSentryMonitorConfig,
} from "./cron-monitor-config";

export type CronStatus = "idle" | "running" | "success" | "failed";

export interface CronRunRecord {
  job: string;
  schedule: string;
  status: CronStatus;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
}

/**
 * The Sentry environment whose runs check in. Staging and development run the
 * same crons but have no monitors: their check-ins were only dropped events.
 */
const CHECK_IN_ENVIRONMENT = "production";

/** An open Sentry check-in of one run. */
interface OpenCheckIn {
  checkInId: string;
  monitorSlug: string;
  config: SentryMonitorConfig | undefined;
}

/**
 * Cron tracking: start, finish, status and duration of every tracked cron run.
 *
 * - In memory (reset on restart) for the admin jobs page. Persisting it would
 *   need a schema change and is deliberately not done yet.
 * - Sentry cron check-ins only for a job with a `monitor` in the cron catalog
 *   and only when the Sentry client's environment is production. The monitor
 *   config (schedule, time zone, thresholds) goes with every check-in, so
 *   Sentry creates and updates the monitor itself. Check-ins are fire and
 *   forget: nothing is awaited or flushed and every Sentry call is guarded,
 *   so Sentry can never fail, delay or change a run.
 * - A failed run is an `error` (an alarm) on a state change: the first
 *   failure, or a failure that differs from the previous run's (another
 *   reason, another entity; compared by the repeat-report key). The same
 *   failure on the next runs is a `warn` until the repeat window has passed
 *   since it was last raised; then it is raised again, so a failure that
 *   lasts still reaches Sentry about once a day, as the throttle intends.
 *   The first success after a failure is logged as a recovery. Every run
 *   still fails (Bull retry) and, on a monitored job, sends its "error"
 *   check-in. The state is in memory: after a restart the first failure is
 *   an `error` again, and the Redis repeat throttle keeps that from becoming
 *   a second event inside its window (`SentryReportThrottle`).
 */
@Injectable()
export class CronTrackerService implements OnModuleInit {
  private readonly logger = new Logger("CronTracker");
  private readonly records = new Map<string, CronRunRecord>();
  /**
   * Per job, the failure its last run ended with; absent after a success.
   * `raisedAt` is when it was last logged at error (null: never, because
   * its steps had already reported it).
   */
  private readonly openFailures = new Map<
    string,
    { key: string; runs: number; raisedAt: number | null }
  >();
  /** Monitored jobs already warned about a schedule with no crontab form. */
  private readonly warnedSchedules = new Set<string>();

  constructor() {
    // Let the run helpers reach the tracker before any cron fires.
    setCronTracker(this);
  }

  onModuleInit(): void {
    setCronTracker(this);
  }

  list(): CronRunRecord[] {
    return [...this.records.values()].sort((a, b) =>
      a.job.localeCompare(b.job),
    );
  }

  private ensure(job: string, schedule: string): CronRunRecord {
    let rec = this.records.get(job);
    if (!rec) {
      rec = {
        job,
        schedule,
        status: "idle",
        lastStartedAt: null,
        lastFinishedAt: null,
        lastDurationMs: null,
        lastError: null,
        runs: 0,
        failures: 0,
      };
      this.records.set(job, rec);
    }
    return rec;
  }

  private slug(job: string): string {
    return job.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  }

  /**
   * WRAPS the cron run without changing it: returns its result and rethrows
   * its error as is; only adds the record and, for a monitored job, the
   * Sentry check-ins around it.
   *
   * @param schedule the Bull repeatable cron expression of this run.
   * @param timezone the Bull repeatable time zone (`job.opts.repeat.tz`).
   */
  async track<T>(
    job: string,
    schedule: string,
    fn: () => Promise<T> | T,
    timezone?: string,
  ): Promise<T> {
    const rec = this.ensure(job, schedule);
    rec.schedule = schedule;
    rec.status = "running";
    rec.lastStartedAt = new Date().toISOString();
    rec.runs += 1;
    const start = Date.now();

    const checkIn = this.openCheckIn(job, schedule, timezone);

    const finalize = (status: "success" | "failed", error?: unknown) => {
      rec.status = status;
      rec.lastFinishedAt = new Date().toISOString();
      rec.lastDurationMs = Date.now() - start;
      if (status === "failed") {
        rec.failures += 1;
        rec.lastError = errorMessage(error);
      } else {
        rec.lastError = null;
      }
      this.closeCheckIn(
        checkIn,
        status === "success" ? "ok" : "error",
        rec.lastDurationMs,
      );
    };

    try {
      const result = await fn();
      finalize("success");
      this.closeFailure(job);
      return result;
    } catch (e) {
      finalize("failed", e);
      this.reportFailure(job, rec, e);
      throw e; // unchanged: the error goes up as is
    }
  }

  /**
   * Sends the "in_progress" check-in of a monitored job in production.
   * Never throws: a Sentry problem only costs the check-in.
   */
  private openCheckIn(
    job: string,
    schedule: string,
    timezone: string | undefined,
  ): OpenCheckIn | undefined {
    try {
      const monitor = cronMonitorFor(job);
      if (!monitor) return undefined;
      if (
        Sentry.getClient()?.getOptions().environment !== CHECK_IN_ENVIRONMENT
      ) {
        return undefined;
      }
      const config =
        buildSentryMonitorConfig(schedule, timezone, monitor) ?? undefined;
      if (!config) this.warnUnsupportedSchedule(job, schedule);
      const monitorSlug = this.slug(job);
      const checkInId = Sentry.captureCheckIn(
        { monitorSlug, status: "in_progress" },
        config,
      );
      return { checkInId, monitorSlug, config };
    } catch {
      return undefined;
    }
  }

  /** Sends the closing check-in with the same id and config. Never throws. */
  private closeCheckIn(
    checkIn: OpenCheckIn | undefined,
    status: "ok" | "error",
    durationMs: number,
  ): void {
    if (!checkIn) return;
    try {
      Sentry.captureCheckIn(
        {
          checkInId: checkIn.checkInId,
          monitorSlug: checkIn.monitorSlug,
          status,
          duration: durationMs / 1000,
        },
        checkIn.config,
      );
    } catch {
      /* the check-in is lost, the run is not */
    }
  }

  private warnUnsupportedSchedule(job: string, schedule: string): void {
    if (this.warnedSchedules.has(job)) return;
    this.warnedSchedules.add(job);
    // A warn, not an alarm: check-ins still go out, but Sentry can only
    // match them to a monitor created by hand.
    this.logger.warn(
      `Cron '${job}' schedule '${schedule}' has no 5-field crontab form; its Sentry check-ins carry no monitor config`,
    );
  }

  private reportFailure(job: string, rec: CronRunRecord, error: unknown) {
    const line = `Cron '${job}' FAILED (${rec.lastDurationMs}ms): ${rec.lastError}`;
    const alreadyReported = isAlreadyReportedCronFailure(error);
    const key = buildErrorReportKey({
      // An already-reported summary and the same text that is NOT reported
      // yet are different states: the second one's alarm must not be lost.
      context: alreadyReported ? `${job}:steps-reported` : job,
      errorName: error instanceof Error ? error.name : undefined,
      message: rec.lastError ?? "",
    });
    const now = Date.now();
    const open = this.openFailures.get(job);
    const unchanged = open?.key === key;
    const runs = unchanged ? open.runs + 1 : 1;
    const raisedRecently =
      unchanged &&
      open.raisedAt !== null &&
      now - open.raisedAt < SENTRY_REPEAT_WINDOW_SECONDS * 1000;

    if (alreadyReported) {
      // Each failed step already logged its own error (id + stack); a second
      // error here made every failure two Sentry events. The run still fails
      // (Bull retry, check-in "error"), this line only stops the duplicate.
      this.logger.warn(line);
      this.openFailures.set(job, { key, runs, raisedAt: null });
    } else if (raisedRecently) {
      // Same failure as the last run, raised within the window.
      this.logger.warn(`${line} (unchanged, ${runs} failed runs in a row)`);
      this.openFailures.set(job, { key, runs, raisedAt: open.raisedAt });
    } else {
      // A new failure, or one that has lasted a whole window: this run's
      // alarm. The stack says where.
      this.logger.error(line, errorStack(error));
      this.openFailures.set(job, { key, runs, raisedAt: now });
    }
  }

  private closeFailure(job: string) {
    const open = this.openFailures.get(job);
    if (!open) return;
    this.openFailures.delete(job);
    this.logger.log(`Cron '${job}' recovered after ${open.runs} failed run(s)`);
  }
}
