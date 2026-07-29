import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { setCronTracker } from "./cron-tracker.holder";

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
 */
@Injectable()
export class CronTrackerService implements OnModuleInit {
  private readonly logger = new Logger("CronTracker");
  private readonly records = new Map<string, CronRunRecord>();

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
        rec.lastError = error instanceof Error ? error.message : String(error);
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
      return result;
    } catch (e) {
      finalize("failed", e);
      this.logger.error(
        `Cron '${job}' FAILED (${rec.lastDurationMs}ms): ${rec.lastError}`,
      );
      throw e; // davranış korunur — hata yukarı aynen gider
    }
  }
}
