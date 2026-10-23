import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { setCronTracker } from "./cron-tracker.holder";
import { errorMessage, errorStack } from "../common/helpers/error-message";
import { isAlreadyReportedCronFailure } from "./cron-step-runner";
import { buildErrorReportKey } from "../common/logging/error-report-key";

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
 * Cron izleme — izlenen her cron çalıştığında başlangıç/bitiş/durum/süre kaydı.
 *
 * - In-memory (restart'ta sıfırlanır); kalıcı geçmiş için Sentry Crons devreye
 *   girer (DSN tanımlıysa). DB persistleme ileride eklenebilir (şema değişikliği
 *   gerektirdiği için bilinçli olarak şimdilik yok).
 * - Sentry check-in çağrıları DSN yokken güvenle no-op'tur; production'da DSN +
 *   Sentry Cron Monitoring açılınca otomatik "job çalışmadı/patladı" alarmı verir.
 * - A failed run is an `error` (an alarm) only on a state change: the first
 *   failure, or a failure that differs from the previous run's (another
 *   reason, another entity; compared by the repeat-report key). The same
 *   failure on the next runs is a `warn`, and the first success after it is
 *   logged as a recovery. Every run still fails (Bull retry) and still sends
 *   its "error" check-in, so the Sentry Crons view shows a failure that lasts.
 *   The state is in memory: after a restart the first failure is an `error`
 *   again, and the Redis repeat throttle keeps that from becoming a second
 *   event inside its window (`SentryReportThrottle`).
 */
@Injectable()
export class CronTrackerService implements OnModuleInit {
  private readonly logger = new Logger("CronTracker");
  private readonly records = new Map<string, CronRunRecord>();
  /** Per job, the failure its last run ended with; absent after a success. */
  private readonly openFailures = new Map<
    string,
    { key: string; runs: number }
  >();

  constructor() {
    // Decorator'lar cron tetiklenmeden önce tracker'a ulaşabilsin.
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
   * Orijinal cron işini SARMALAR: davranışı birebir korur (sonucu döndürür,
   * hatayı aynen rethrow eder), sadece etrafına ölçüm + check-in ekler.
   */
  async track<T>(
    job: string,
    schedule: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const rec = this.ensure(job, schedule);
    rec.schedule = schedule;
    rec.status = "running";
    rec.lastStartedAt = new Date().toISOString();
    rec.runs += 1;
    const start = Date.now();

    let checkInId: string | undefined;
    try {
      checkInId = Sentry.captureCheckIn({
        monitorSlug: this.slug(job),
        status: "in_progress",
      });
    } catch {
      /* Sentry yoksa sessiz geç */
    }

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
      try {
        if (checkInId) {
          Sentry.captureCheckIn({
            checkInId,
            monitorSlug: this.slug(job),
            status: status === "success" ? "ok" : "error",
          });
        }
      } catch {
        /* no-op */
      }
    };

    try {
      const result = await fn();
      finalize("success");
      this.closeFailure(job);
      return result;
    } catch (e) {
      finalize("failed", e);
      this.reportFailure(job, rec, e);
      throw e; // davranış korunur — hata yukarı aynen gider
    }
  }

  private reportFailure(job: string, rec: CronRunRecord, error: unknown) {
    const line = `Cron '${job}' FAILED (${rec.lastDurationMs}ms): ${rec.lastError}`;
    const key = buildErrorReportKey({
      context: job,
      errorName: error instanceof Error ? error.name : undefined,
      message: rec.lastError ?? "",
    });
    const open = this.openFailures.get(job);
    const unchanged = open?.key === key;
    const runs = unchanged ? open.runs + 1 : 1;
    this.openFailures.set(job, { key, runs });

    if (isAlreadyReportedCronFailure(error)) {
      // Each failed step already logged its own error (id + stack); a second
      // error here made every failure two Sentry events. The run still fails
      // (Bull retry, check-in "error"), this line only stops the duplicate.
      this.logger.warn(line);
    } else if (unchanged) {
      // Same failure as the last run: the first one was the alarm.
      this.logger.warn(`${line} (unchanged, ${runs} failed runs in a row)`);
    } else {
      // A new failure is this run's alarm; the stack says where.
      this.logger.error(line, errorStack(error));
    }
  }

  private closeFailure(job: string) {
    const open = this.openFailures.get(job);
    if (!open) return;
    this.openFailures.delete(job);
    this.logger.log(`Cron '${job}' recovered after ${open.runs} failed run(s)`);
  }
}
