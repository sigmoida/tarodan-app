import { Logger } from "@nestjs/common";
import type { Queue } from "bull";

/**
 * Zamanlanmış cron'ları Bull repeatable olarak kaydetmek için ortak yardımcılar.
 *
 * Tüm cron'lar tek yoldan çalışır: worker'daki Bull processor'ı. API HTTP-only'dir
 * ve yalnız repeatable kaydını yapar (idempotent, tüketici yok). Bull'ın tek-teslim
 * garantisi çift-çalışmayı önler; in-process @Cron yolu tümüyle kaldırıldı.
 */

/**
 * Zamanlanmış cron'ların koştuğu saat dilimi. PIN edilmeli: aksi halde Bull
 * repeatable cron expression'ları sunucunun (genelde UTC) saatinde tetiklenir,
 * ör. `'0 3 * * *'` = 03:00 UTC = 06:00 İstanbul → günlük işler yanlış saatte.
 * Tüm zamanlar Türkiye yerel saatine göre yazıldığı için burada pinliyoruz.
 */
export const SCHEDULED_CRON_TZ = "Europe/Istanbul";

/**
 * Repeatable cron'lar için tekrar-deneme politikası.
 *
 * Global `defaultJobOptions` bu kuyruğa `attempts: 3` + exponential backoff
 * miras verir. Bir CRON işi için bu TEHLİKELİDİR: iş geçici bir hatayla throw
 * ederse Bull onu saniyeler içinde 2 kez daha çalıştırır — para-kritik işlerde
 * (payout/auto-renewal/refund) bu çift side-effect riski demek. Cron'un doğal
 * tekrar mekanizması zaten bir sonraki tick'tir, o yüzden default `attempts: 1`.
 * İsteyen çağıran (idempotent, okuma-ağırlıklı iş) `opts.attempts` ile artırabilir.
 */
const DEFAULT_CRON_ATTEMPTS = 1;

/**
 * Bu PROCESS'te `enabled` olarak kaydı yapılan iş adları. Orphan temizliği
 * (cleanupOrphanRepeatables) bunun DIŞINDA kalan repeatable'ları siler.
 */
const registeredJobNames = new Set<string>();

export interface RepeatableCronOptions {
  /** Tekrar-deneme sayısı (default 1 — bkz. DEFAULT_CRON_ATTEMPTS). */
  attempts?: number;
  /** Saat dilimi override'ı (default Europe/Istanbul). */
  tz?: string;
}

/**
 * Bir cron'u Bull repeatable olarak kaydeder (kendi kendini onarır): önce aynı
 * isimli eski kaydı siler (restart'ta çoğalmasın; tz/cron değişince eski repeat-key
 * de temizlensin — Bull tz'yi key'e gömer), sonra yeniden ekler. Idempotent: kaç
 * process/replika çağırırsa çağırsın iş başına tek repeatable kalır.
 *
 * Tüm hatalar yutulur + loglanır: bir kayıt işi açılışı bloklamaz.
 */
export async function registerRepeatableCron(
  queue: Queue,
  jobName: string,
  cron: string,
  logger: Logger,
  opts?: RepeatableCronOptions,
): Promise<void> {
  try {
    // Önce aynı isimli mevcut repeatable'ları temizle (idempotent upsert).
    const existing = await queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === jobName) {
        await queue.removeRepeatableByKey(r.key);
      }
    }
    const tz = opts?.tz ?? SCHEDULED_CRON_TZ;
    const attempts = opts?.attempts ?? DEFAULT_CRON_ATTEMPTS;
    await queue.add(
      jobName,
      {},
      {
        repeat: { cron, tz },
        removeOnComplete: 50,
        removeOnFail: 50,
        // Global default'un (3) üstüne yaz: cron için 1 tick = 1 çalışma.
        attempts,
      },
    );
    logger.log(
      `Bull repeatable registered: '${jobName}' (${cron}, tz=${tz}, attempts=${attempts}).`,
    );
    registeredJobNames.add(jobName);
  } catch (e: any) {
    logger.error(
      `Bull repeatable sync failed ('${jobName}', non-fatal): ${e.message}`,
    );
  }
}

/**
 * Redis'teki ÖLÜ repeatable key'lerini temizler: bu process'te `enabled` olarak
 * kaydedilen işlerin (registeredJobNames) DIŞINDA kalan tüm repeatable'ları siler.
 * Bir iş yeniden adlandırılır/silinirse helper'ın isim-bazlı self-heal'i eskiyi
 * bulamaz; bu süpürme onları toplar.
 *
 * ⚠ SADECE tüm işleri kaydeden process'te (worker) çağrılmalı — aksi halde o
 * process'in bilmediği CANLI bir job'un key'i silinir. OnApplicationBootstrap'te
 * (tüm onModuleInit registration'larından SONRA) çağır.
 */
export async function cleanupOrphanRepeatables(
  queue: Queue,
  logger: Logger,
): Promise<void> {
  try {
    const existing = await queue.getRepeatableJobs();
    let removed = 0;
    for (const r of existing) {
      if (!registeredJobNames.has(r.name)) {
        await queue.removeRepeatableByKey(r.key);
        removed++;
        logger.warn(`Orphan repeatable removed: '${r.name}' (${r.cron}).`);
      }
    }
    if (removed > 0) {
      logger.log(`Orphan repeatable sweep: ${removed} records removed.`);
    }
  } catch (e: any) {
    logger.error(`Orphan repeatable sweep failed (non-fatal): ${e.message}`);
  }
}
