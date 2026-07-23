import type { Job } from "bull";
import { getCronTracker } from "./cron-tracker.holder";

export interface CronRunSummary {
  /** Tek satır insan-okur özet (PII İÇERMEZ — sayaç/durum). */
  summary?: string;
  /** Sayısal istatistikler (ör. { due: 3, sent: 2, failed: 1 }). */
  stats?: Record<string, number>;
}

export interface CronRunResult extends CronRunSummary {
  ok: boolean;
  durationMs: number;
}

/**
 * Bir cron işini "izlenebilir" çalıştırır:
 *  - `log(msg)` → Bull job log'una yazar → dashboard **Kayıtlar** sekmesi.
 *  - fn'in döndürdüğü özet (summary + stats) → **returnValue** → **Veri** sekmesi.
 *  - Hata → loglanır + rethrow → Bull "başarısız" işaretler, **Hata** sekmesi dolar.
 *
 * GİZLİLİK (KVKK): loglara yazılan hiçbir şey kişisel veri (PII) içermez —
 * yalnız sayaç ve durum. (Kalıcı saklama yapılmaz; geçmiş Bull/Redis'tedir.)
 *
 * Faz 7.5: Bull tek zamanlama mekanizması olunca cron gözlemlenebilirliği (in-memory
 * `/admin/jobs` kaydı + Sentry Cron check-in) — eskiden `@TrackedCron`'un beslediği —
 * artık bu TEK yürütme yolundan CronTracker'a beslenir. Zamanlama, repeatable job'ın
 * `opts.repeat.cron`'undan alınır (yoksa 'bull'). Tracker yoksa iş sarılmadan koşar.
 */
export async function runTrackedJob(
  job: Job,
  jobName: string,
  fn: (
    log: (msg: string) => void,
  ) => Promise<CronRunSummary | void> | CronRunSummary | void,
): Promise<CronRunResult> {
  const log = (msg: string): void => {
    // Bull "Kayıtlar" sekmesine düşer; loglama hatası işi asla bozmaz.
    void job.log(`[${jobName}] ${msg}`).catch(() => undefined);
  };

  const exec = async (): Promise<CronRunResult> => {
    const started = Date.now();
    try {
      const res = (await fn(log)) || {};
      const durationMs = Date.now() - started;
      log(`✓ bitti (${durationMs}ms)${res.summary ? " — " + res.summary : ""}`);
      return { ok: true, durationMs, summary: res.summary, stats: res.stats };
    } catch (e: any) {
      log(`✗ HATA (${Date.now() - started}ms): ${e?.message ?? e}`);
      throw e; // Bull job'u "failed" yapsın, Hata sekmesi stack göstersin.
    }
  };

  // CronTracker: /admin/jobs + Sentry check-in besle. track() sonucu döndürür ve hatayı
  // AYNEN rethrow eder → Bull yine "failed" işaretler; davranış korunur.
  const tracker = getCronTracker();
  if (!tracker) return exec();
  const schedule =
    (job?.opts as { repeat?: { cron?: string } })?.repeat?.cron ?? "bull";
  return tracker.track(jobName, schedule, exec);
}
