import type { Job } from 'bull';

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
 */
export async function runTrackedJob(
  job: Job,
  jobName: string,
  fn: (log: (msg: string) => void) => Promise<CronRunSummary | void> | CronRunSummary | void,
): Promise<CronRunResult> {
  const started = Date.now();
  const log = (msg: string): void => {
    // Bull "Kayıtlar" sekmesine düşer; loglama hatası işi asla bozmaz.
    void job.log(`[${jobName}] ${msg}`).catch(() => undefined);
  };

  try {
    const res = (await fn(log)) || {};
    const durationMs = Date.now() - started;
    log(`✓ bitti (${durationMs}ms)${res.summary ? ' — ' + res.summary : ''}`);
    return { ok: true, durationMs, summary: res.summary, stats: res.stats };
  } catch (e: any) {
    log(`✗ HATA (${Date.now() - started}ms): ${e?.message ?? e}`);
    throw e; // Bull job'u "failed" yapsın, Hata sekmesi stack göstersin.
  }
}
