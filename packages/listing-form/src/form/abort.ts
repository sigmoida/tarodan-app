/** @format */

/**
 * İptalin TEK sözlüğü. Kuyruk, küçültme ve çevirme aynı hatayı üretir ve aynı
 * şekilde tanır: biri başka bir biçimde iptal etseydi, kaldırılan bir kalem
 * karoda "yüklenemedi" diye görünebilir ya da küçültme iptali "küçültülemedi,
 * orijinali gönder" sanılıp istek yine de başlayabilirdi.
 */

export function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" });
}

/** Sinyal iptal edildiyse `AbortError` fırlatır (`signal.throwIfAborted` eski Safari'de yok). */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Tarayıcı `AbortError`'ı ile axios iptali (`ERR_CANCELED`) aynı şeydir. */
export function isAbortError(error: unknown): boolean {
  return (
    (error as { name?: string })?.name === "AbortError" ||
    (error as { code?: string })?.code === "ERR_CANCELED"
  );
}
