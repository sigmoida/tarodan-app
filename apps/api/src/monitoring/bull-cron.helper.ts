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
 * Bir cron'un Bull repeatable kaydını flag durumuna göre SENKRONLAR (kendi kendini
 * onarır):
 *  - `enabled=true`  → kaydı (yeniden) oluşturur. Önce aynı isimli eskileri siler
 *    ki restart'larda çoğalmasın.
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
      await queue.add(
        jobName,
        {},
        { repeat: { cron }, removeOnComplete: 50, removeOnFail: 50 },
      );
      logger.log(`Bull repeatable kayıtlı: '${jobName}' (${cron}).`);
    } else if (existing.some((r) => r.name === jobName)) {
      logger.log(`Bull repeatable temizlendi (flag kapalı): '${jobName}'.`);
    }
  } catch (e: any) {
    logger.error(`Bull repeatable sync başarısız ('${jobName}', non-fatal): ${e.message}`);
  }
}
