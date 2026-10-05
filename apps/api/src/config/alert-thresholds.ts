import type { TimingValues } from "../common/timing-rules/timing-rules.resolver";

/**
 * Operasyon alarmlarının SAYISAL EŞİKLERİ — tek okuma noktası.
 *
 * Aynı gün/saat sayıları ayrı yerlerde okunuyordu: `order-scheduler` cron'u
 * ConfigService'ten, finans özeti doğrudan `process.env`den, dashboard hiç
 * okumuyordu. Eşik değiştiğinde panelin "10 günden uzun" demesi ile cron'un 14
 * günü beklemesi mümkündü. Tek erişimci bu ayrışmayı imkânsız kılar.
 *
 * İş eşikleri (kargoda takılı sipariş, barkodsuz gönderi, taşıyıcı iptal
 * görevi, fatura süresi) artık Süreler ve Kurallar kaydındadır ve admin
 * ekranından değişir: tur başında bir kez çözülür (`loadTimingValues`) ve
 * `AlertThresholdContext.timing` olarak tanımlara geçer. Burada yalnız teknik
 * (ms) eşik kalır.
 */

/** ConfigService yüzeyi; yardımcılar ve spec'ler için gevşek tutulur. */
export interface ThresholdConfigReader {
  get<T = string>(key: string): T | undefined;
}

/** Bir dashboard/cron turunun eşik bağlamı. */
export interface AlertThresholdContext {
  /** Süreler ve Kurallar → bu tur için çözülmüş değerler. */
  timing: TimingValues;
  /** Teknik eşikler (outbox) için env okuyucusu. */
  config?: ThresholdConfigReader;
}

/** Geçersiz veya pozitif olmayan değer varsayılana düşer. */
function toPositive(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Kesintiye uğramış bir outbox `processing` claim'inin bayat sayılma süresi (ms).
 * Drainer bu süreden sonra satırı `pending`'e geri alır; dashboard uyarısı da
 * AYNI eşiği okur, yoksa panel "takılı" derken drainer çoktan kurtarmıştır.
 * Teknik bir süre olduğu için Süreler ve Kurallar'a alınmadı.
 */
export function outboxStaleProcessingMs(
  config?: ThresholdConfigReader,
): number {
  return toPositive(
    config?.get<string>("OUTBOX_STALE_PROCESSING_MS") ??
      process.env.OUTBOX_STALE_PROCESSING_MS,
    5 * 60 * 1000,
  );
}
