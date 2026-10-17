/**
 * Geçici ağ hatalarına karşı yeniden deneme — YALNIZ okuma/idempotent PayTR
 * çağrıları için (rapor okuma, geri dönen transfer sorgusu). Para taşıyan
 * çağrılar (platform transferi, hesaptan gönderme, tahsilat, iade) burayı
 * KULLANMAZ: çift-gönderim riski `PayTRCredentials`teki O1 notunda bilinçli
 * olarak kabul edilmemişti — o karar hâlâ geçerli, bu yardımcı yalnız
 * sonucu değiştirmeyen okumalara uygulanır.
 *
 * 2026-09-24 Sentry: bir gecelik "fetch failed" ağ kesintisi, `payout-check-returned`
 * ve `paytr-statement-sync` cron'larında aynı olayı üç kere alarma çevirdi
 * (servis → scheduler → cron tracker). Bir sonraki tur PayTR'a hiçbir şey
 * yazmadan aynı sorguyu tekrarladığı için (GET benzeri, idempotent) burada
 * sessizce 2 kez yeniden denemek güvenli; kalıcı arızada cron tracker'ın
 * alarmı zaten görülür.
 */

/** `fetch`'in bağlantı seviyesinde attığı hatalarda Node'un koyduğu kodlar. */
const RETRYABLE_CAUSE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

/** Node/undici, DNS/bağlantı hatalarını `TypeError("fetch failed")` olarak sarar; asıl
 *  sebep `error.cause` içindedir. `AbortSignal.timeout` ise `AbortError`/`TimeoutError` fırlatır. */
export function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  const cause = (error as { cause?: unknown }).cause;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;
  if (causeCode && RETRYABLE_CAUSE_CODES.has(causeCode)) return true;
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

/** `error.cause?.code` varsa mesaja ekler — ör. "fetch failed" tek başına
 *  hangi ağ arızası olduğunu söylemez, log satırında gerçek sebep görünsün. */
export function networkErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown })?.cause;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code)
      : undefined;
  return causeCode ? `${message} (${causeCode})` : message;
}

export interface PaytrFetchRetryOptions {
  /** İlk deneme dışında kaç deneme daha yapılsın. Varsayılan: 2. */
  retries?: number;
  /** Her deneme arası bekleme (ms). Testlerde 0 verilebilir. Varsayılan: [1000, 3000]. */
  delaysMs?: number[];
}

/**
 * `fn` bir `fetch(...)` çağrısı yapsın. Ağ seviyesinde atılan hata (yukarıdaki
 * kodlar/AbortError/"fetch failed") ya da HTTP 5xx yanıtta yeniden dener;
 * 4xx ve PayTR'nin kendi iş hatası (HTTP 200 + `status: "error"` gövdesi)
 * yeniden denenMEZ — çağıran gövdeyi kendi okur.
 */
export async function withPaytrFetchRetry(
  fn: () => Promise<Response>,
  options: PaytrFetchRetryOptions = {},
): Promise<Response> {
  const delaysMs = options.delaysMs ?? [1000, 3000];
  const retries = options.retries ?? delaysMs.length;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fn();
      const canRetryStatus = response.status >= 500 && attempt < retries;
      if (!canRetryStatus) return response;
    } catch (error) {
      const canRetryError = isRetryableNetworkError(error) && attempt < retries;
      if (!canRetryError) throw error;
    }
    const delay = delaysMs[attempt] ?? delaysMs[delaysMs.length - 1] ?? 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
