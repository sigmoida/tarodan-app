import { Logger } from "@nestjs/common";
import type { Queue } from "bull";

/**
 * Zamanlanmış işler için Bull repeatable kayıt yardımcısı.
 *
 * Faz 7.5: in-process cron ikizleri ve geçiş flag'leri (CRONS_VIA_BULL /
 * MONEY_CRONS_VIA_BULL) kaldırıldı. Bull artık TEK zamanlama mekanizmasıdır —
 * her cron `onModuleInit`'te koşulsuz repeatable olarak kaydedilir.
 */

/**
 * Bir cron'un Bull repeatable kaydını SENKRONLAR (kendi kendini onarır): önce aynı
 * isimli mevcut repeatable'ları siler (restart'larda çoğalmasın) ve ardından yeniden
 * kaydeder. Tüm hatalar yutulur + loglanır: bir kayıt işi API açılışını bloklamaz.
 */
export async function registerRepeatableCron(
  queue: Queue,
  jobName: string,
  cron: string,
  logger: Logger,
): Promise<void> {
  try {
    const existing = await queue.getRepeatableJobs();
    for (const r of existing) {
      if (r.name === jobName) {
        await queue.removeRepeatableByKey(r.key);
      }
    }
    await queue.add(
      jobName,
      {},
      {
        // Konteynerlerde TZ set edilmiyor (UTC): tz verilmezse tüm saatler
        // +3 kayar — "09:00" gönderimleri öğlen, gece bakımı sabah koşardı.
        repeat: { cron, tz: "Europe/Istanbul" },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    logger.log(`Bull repeatable kayıtlı: '${jobName}' (${cron}).`);
  } catch (e: any) {
    logger.error(
      `Bull repeatable sync başarısız ('${jobName}', non-fatal): ${e.message}`,
    );
  }
}
