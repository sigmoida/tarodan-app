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

/**
 * Causes that only occur while opening the connection, before undici writes
 * the request: DNS failures, a refused or unreachable host, and undici's own
 * connect timeout (`UND_ERR_CONNECT_TIMEOUT`, about 10 s; Sentry
 * TARODAN-API-30). Post-send causes (`ECONNRESET`, a read `ETIMEDOUT`,
 * `UND_ERR_SOCKET`, header/body timeouts) are deliberately absent.
 */
const CONNECT_PHASE_CAUSE_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

function fieldOf(value: unknown, key: "code" | "syscall"): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return field == null ? undefined : String(field);
}

/** True when this cause provably happened before the request was written. */
function isConnectPhaseCause(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  // Node's Happy Eyeballs (autoSelectFamily) wraps one failure per address in
  // an AggregateError; it is connect-phase only if every attempt was.
  const attempts = (cause as { errors?: unknown }).errors;
  if (Array.isArray(attempts) && attempts.length > 0) {
    return attempts.every(isConnectPhaseCause);
  }
  const code = fieldOf(cause, "code");
  if (code && CONNECT_PHASE_CAUSE_CODES.has(code)) return true;
  // Any error of the TCP connect syscall (incl. a connect ETIMEDOUT).
  return fieldOf(cause, "syscall") === "connect";
}

/**
 * Money writes (platform transfer, later refunds) must know whether a failed
 * `fetch` could have reached PayTR. `not_sent`: the connection was never
 * established, resending the same request is safe. `unknown`: anything else,
 * including our own `AbortSignal.timeout` and "fetch failed" without a cause;
 * the caller must not resend without checking PayTR first.
 * `isRetryableNetworkError` above stays the read-path rule: it retries
 * post-send causes, which only idempotent reads may do.
 */
export function classifyPaytrFetchError(
  error: unknown,
): "not_sent" | "unknown" {
  return isConnectPhaseCause((error as { cause?: unknown } | null)?.cause)
    ? "not_sent"
    : "unknown";
}

/** Short machine code of a fetch failure for logs and stored outcomes:
 *  `error.cause.code`, or the timeout/abort name, else `undefined`. */
export function fetchErrorCode(error: unknown): string | undefined {
  const causeCode = fieldOf(
    (error as { cause?: unknown } | null)?.cause,
    "code",
  );
  if (causeCode) return causeCode;
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return error.name;
  }
  return undefined;
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
