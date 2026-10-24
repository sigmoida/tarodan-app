import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { setCronTracker } from "./cron-tracker.holder";
import { appEnv } from "../config/environment";
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
 * The deployment (`APP_ENV`) whose runs check in. Staging and development run
 * the same crons but have no monitors: their check-ins were only dropped
 * events, and a staging check-in tagged "production" (SENTRY_ENVIRONMENT
 * unset falls back to NODE_ENV) would fill the production monitor's slots.
 * APP_ENV is validated at boot whenever NODE_ENV is production.
 */
const CHECK_IN_APP_ENV = "production";

/** What the Bull job says about this run (`runTrackedJob`). */
export interface TrackedRunContext {
  /** Time zone of the Bull repeatable (`job.opts.repeat.tz`). */
  timezone?: string;
  /** Bull job id: the automatic retries of one scheduled slot share it. */
  jobId?: string;
  /**
   * False while Bull will retry a failure of this attempt by itself
   * (default true). One slot is one Sentry check-in across its attempts.
   */
  finalAttempt?: boolean;
}

/** An open Sentry check-in of one scheduled slot. */
interface OpenCheckIn {
  checkInId: string;
  monitorSlug: string;
  config: SentryMonitorConfig | undefined;
  jobId: string | undefined;
  /** When the slot's first attempt started, for the reported duration. */
  startedAt: number;
}

/**
 * Cron tracking: start, finish, status and duration of every tracked cron run.
 *
 * - In memory (reset on restart) for the admin jobs page. Persisting it would
 *   need a schema change and is deliberately not done yet.
 * - Sentry cron check-ins only for a job with a `monitor` in the cron catalog,
 *   only on the production deployment and only with a Sentry client. The
 *   monitor config (schedule, time zone, thresholds) goes with every
 *   check-in, so Sentry creates and updates the monitor itself. One scheduled
 *   slot is one check-in: a failed attempt that Bull retries keeps it open
 *   and the retry closes it, so the monitor's thresholds count slots, not
 *   attempts (a retry landing on another worker process opens its own, and
 *   the first one times out in Sentry). Check-ins are fire and forget:
 *   nothing is awaited or flushed and every Sentry call is guarded, so Sentry
 *   can never fail, delay or change a run.
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
  /** `job|schedule` pairs already warned about having no crontab form. */
  private readonly warnedSchedules = new Set<string>();
  /** Per monitored job, the check-in of a failed slot that Bull will retry. */
  private readonly retryingCheckIns = new Map<string, OpenCheckIn>();

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
   */
  async track<T>(
    job: string,
    schedule: string,
    fn: () => Promise<T> | T,
    run: TrackedRunContext = {},
  ): Promise<T> {
    const rec = this.ensure(job, schedule);
    rec.schedule = schedule;
    rec.status = "running";
    rec.lastStartedAt = new Date().toISOString();
    rec.runs += 1;
    const start = Date.now();

    const checkIn = this.openCheckIn(job, schedule, run);

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
        job,
        checkIn,
        status === "success" ? "ok" : "error",
        run.finalAttempt ?? true,
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
   * The check-in of this run: the one its slot's failed attempt left open
   * (a Bull retry), or a new "in_progress" one. Only for a monitored job on
   * the production deployment with a Sentry client. Never throws: a Sentry
   * problem only costs the check-in.
   */
  private openCheckIn(
    job: string,
    schedule: string,
    run: TrackedRunContext,
  ): OpenCheckIn | undefined {
    try {
      const monitor = cronMonitorFor(job);
      if (!monitor) return undefined;
      if (appEnv() !== CHECK_IN_APP_ENV || !Sentry.getClient()) {
        return undefined;
      }
      const retrying = this.retryingCheckIns.get(job);
      this.retryingCheckIns.delete(job);
      if (retrying && run.jobId !== undefined && retrying.jobId === run.jobId) {
        return retrying;
      }
      // A left-over check-in of another slot is dropped here: its retry never
      // ran, and Sentry times it out after the max runtime (a failure).
      const config = buildSentryMonitorConfig(schedule, run.timezone, monitor);
      if (!config) this.warnUnsupportedSchedule(job, schedule);
      const monitorSlug = this.slug(job);
      const checkInId = Sentry.captureCheckIn(
        { monitorSlug, status: "in_progress" },
        config,
      );
      return {
        checkInId,
        monitorSlug,
        config,
        jobId: run.jobId,
        startedAt: Date.now(),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Closes the slot's check-in with the same id and config, or keeps it open
   * when this attempt failed and Bull retries it. Never throws.
   */
  private closeCheckIn(
    job: string,
    checkIn: OpenCheckIn | undefined,
    status: "ok" | "error",
    finalAttempt: boolean,
  ): void {
    if (!checkIn) return;
    try {
      if (status === "error" && !finalAttempt && checkIn.jobId !== undefined) {
        this.retryingCheckIns.set(job, checkIn);
        return;
      }
      Sentry.captureCheckIn(
        {
          checkInId: checkIn.checkInId,
          monitorSlug: checkIn.monitorSlug,
          status,
          duration: (Date.now() - checkIn.startedAt) / 1000,
        },
        checkIn.config,
      );
    } catch {
      /* the check-in is lost, the run is not */
    }
  }

  private warnUnsupportedSchedule(job: string, schedule: string): void {
    const key = `${job}|${schedule}`;
    if (this.warnedSchedules.has(key)) return;
    this.warnedSchedules.add(key);
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
