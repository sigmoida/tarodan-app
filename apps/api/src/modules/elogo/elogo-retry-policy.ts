/**
 * eLogo gönderim yeniden-deneme politikası.
 *
 * Neden ayrı: `MAX_SEND_ATTEMPTS = 8` ve 30 dakikalık cron birlikte ~4 saatlik bir
 * deneme bütçesi verir. Zaman aşımı / bağlantı hatası gibi GEÇİCİ arızalar da bu
 * bütçeden yediği için sağlayıcı bir günden uzun kapalı kaldığında faturalar kalıcı
 * olarak `failed`'de kalıyor ve e-Arşiv'in 7 günlük yasal süresi sessizce kaçıyordu.
 * Geçici arızalar bütçeyi tüketmemeli; kalıcı (iş kuralı) hataları ise sonsuza dek
 * denenmemeli.
 */

/** Kalıcı hatalar için deneme üst sınırı (tek kaynak). */
export const ELOGO_MAX_SEND_ATTEMPTS = 8;

/** Geçici arızaların bekleyebileceği azami süre — sonrasında alarm verilir. */
export const ELOGO_TRANSIENT_ALARM_MS = 6 * 60 * 60 * 1000;

const TRANSIENT_PATTERNS = [
  "etimedout",
  "esockettimedout",
  "econnrefused",
  "econnreset",
  "enotfound",
  "eai_again",
  "socket hang up",
  "timeout",
  "gateway timeout",
  "service unavailable",
  "bad gateway",
  "502",
  "503",
  "504",
  "network",
];

/**
 * Hata GEÇİCİ mi (ağ/sağlayıcı erişilebilirliği) yoksa KALICI mı (iş kuralı,
 * doğrulama, mükellef bulunamadı)? Geçici hatalar deneme sayacını artırmaz.
 */
export function isTransientElogoFailure(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!message) return false;
  return TRANSIENT_PATTERNS.some((pattern) => message.includes(pattern));
}
