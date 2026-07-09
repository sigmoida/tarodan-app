import { Logger } from '@nestjs/common';
import type { Queue } from 'bull';

/**
 * Cron'ların Bull repeatable'a kademeli taşınması için ortak yardımcılar.
 *
 * Tek flag `CRONS_VIA_BULL` ile taşınan (güvenli) cron grubu topluca kontrol
 * edilir. Default KAPALI → hiçbir cron'un davranışı değişmez (prod güvenli).
 * Para-kritik cron'lar ileride taşınırken kendi ayrı guard'larını da ekler.
 */
export function cronsViaBull(): boolean {
  return process.env.CRONS_VIA_BULL === 'true';
}

/**
 * Para-kritik cron'lar için AYRI flag (default kapalı). Güvenli gruptan bağımsız
 * aç/kapa: sorun çıkarsa yalnız para tarafı geri alınır, güvenli 10 etkilenmez.
 */
export function moneyCronsViaBull(): boolean {
  return process.env.MONEY_CRONS_VIA_BULL === 'true';
}

/**
 * Zamanlanmış cron'ların koştuğu saat dilimi. PIN edilmeli: aksi halde Bull
 * repeatable cron expression'ları sunucunun (genelde UTC) saatinde tetiklenir,
 * ör. `'0 3 * * *'` = 03:00 UTC = 06:00 İstanbul → günlük işler yanlış saatte.
 * Tüm zamanlar Türkiye yerel saatine göre yazıldığı için burada pinliyoruz.
 */
export const SCHEDULED_CRON_TZ = 'Europe/Istanbul';

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

export interface RepeatableCronOptions {
  /** Tekrar-deneme sayısı (default 1 — bkz. DEFAULT_CRON_ATTEMPTS). */
  attempts?: number;
  /** Saat dilimi override'ı (default Europe/Istanbul). */
  tz?: string;
}

/**
 * Bir cron'un Bull repeatable kaydını flag durumuna göre SENKRONLAR (kendi kendini
 * onarır):
 *  - `enabled=true`  → kaydı (yeniden) oluşturur. Önce aynı isimli eskileri siler
 *    ki restart'larda çoğalmasın. Bu aynı zamanda tz/cron değişince eski (farklı
 *    repeat-key'li) kaydın da temizlenmesini sağlar — Bull tz'yi key'e gömer.
 *  - `enabled=false` → varsa eski kaydı Redis'ten TEMİZLER. Böylece "flag açıkken
 *    kaydedip sonra flag'siz başlatma" durumunda kalıntı repeatable kalmaz ve
 *    in-process cron ile çift-çalışma OLUŞMAZ.
 *
 * Tüm hatalar yutulur + loglanır: bir izleme/kayıt işi API açılışını bloklamaz.
 */
export async function registerRepeatableCron(
  queue: Queue,
  jobName: string,
  cron: string,
  enabled: boolean,
  logger: Logger,
  opts?: RepeatableCronOptions,
): Promise<void> {
  try {
    // Her iki durumda da önce aynı isimli mevcut repeatable'ları temizle.
    const existing = await queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === jobName) {
        await queue.removeRepeatableByKey(r.key);
      }
    }
    if (enabled) {
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
      logger.log(`Bull repeatable kayıtlı: '${jobName}' (${cron}, tz=${tz}, attempts=${attempts}).`);
    } else if (existing.some((r) => r.name === jobName)) {
      logger.log(`Bull repeatable temizlendi (flag kapalı): '${jobName}'.`);
    }
  } catch (e: any) {
    logger.error(`Bull repeatable sync başarısız ('${jobName}', non-fatal): ${e.message}`);
  }
}
