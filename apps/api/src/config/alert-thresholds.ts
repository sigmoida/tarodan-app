/**
 * Operasyon alarmlarının SAYISAL EŞİKLERİ — tek okuma noktası.
 *
 * Aynı gün/saat sayıları ayrı yerlerde okunuyordu: `order-scheduler` cron'u
 * ConfigService'ten, finans özeti doğrudan `process.env`den, dashboard hiç
 * okumuyordu. Eşik değiştiğinde panelin "10 günden uzun" demesi ile cron'un 14
 * günü beklemesi mümkündü. Tek erişimci bu ayrışmayı imkânsız kılar.
 *
 * `ConfigService` erişilebilen her yerde verilir (§12); DI'ın ulaşamadığı saf
 * yardımcılar için env geri düşüşü bu dosyada kalır — erişimcinin işi budur.
 */

/** ConfigService yüzeyi; yardımcılar ve spec'ler için gevşek tutulur. */
export interface ThresholdConfigReader {
  get<T = string>(key: string): T | undefined;
}

/** Geçersiz veya pozitif olmayan değer varsayılana düşer. */
function toPositive(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * `shipped`'te takılı sayılmadan önce kargonun geçirmesi gereken gün sayısı.
 * Yaş KARGO damgasından (`Shipment.shippedAt`) ölçülür — sipariş satırının
 * `updatedAt`'i alakasız bir güncellemeyle kayıyordu.
 */
export function shippedStaleAlertDays(config?: ThresholdConfigReader): number {
  return toPositive(
    config?.get<string>("SHIPPED_STALE_ALERT_DAYS") ??
      process.env.SHIPPED_STALE_ALERT_DAYS,
    10,
  );
}

/** Teslim edilmiş siparişin faturasız kalabileceği gün sayısı (e-Arşiv süresi). */
export function invoiceDeadlineDays(config?: ThresholdConfigReader): number {
  return toPositive(
    config?.get<string>("INVOICE_DEADLINE_DAYS") ??
      process.env.INVOICE_DEADLINE_DAYS,
    5,
  );
}

/**
 * Taşıyıcı kodu (`providerTrackingId`) hiç oluşmamış gönderinin alarm yaşı.
 * Barkodu açılamamış gönderi asla takip edilemez ve sessizce askıda kalır.
 */
export function missingTrackingAlertHours(
  config?: ThresholdConfigReader,
): number {
  return toPositive(
    config?.get<string>("MISSING_TRACKING_ALERT_HOURS") ??
      process.env.MISSING_TRACKING_ALERT_HOURS,
    24,
  );
}

/** Panelden çözülmesi gereken taşıyıcı iptal görevinin bayatlama yaşı. */
export function carrierCancellationAlertHours(
  config?: ThresholdConfigReader,
): number {
  return toPositive(
    config?.get<string>("CARRIER_CANCELLATION_ALERT_HOURS") ??
      process.env.CARRIER_CANCELLATION_ALERT_HOURS,
    24,
  );
}

/**
 * Kesintiye uğramış bir outbox `processing` claim'inin bayat sayılma süresi (ms).
 * Drainer bu süreden sonra satırı `pending`'e geri alır; dashboard uyarısı da
 * AYNI eşiği okur, yoksa panel "takılı" derken drainer çoktan kurtarmıştır.
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
