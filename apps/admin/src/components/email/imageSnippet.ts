/**
 * E-posta gövdesine görsel ekleme yardımcıları. Sunucu sanitizer'ı yalnız
 * http/https adreslerini geçirir (data:/javascript: atılır); aynı kural burada
 * da uygulanır ki editör sunucunun sileceği bir etiketi hiç üretmesin.
 */

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** `<img src="…" alt="" style="max-width:100%">`; adres http/https değilse `null`. */
export function emailImageTag(url: string): string | null {
  if (!isHttpUrl(url)) return null;
  const src = url.replace(/"/g, "&quot;");
  return `<img src="${src}" alt="" style="max-width:100%">`;
}

/**
 * `snippet`'i imleç konumuna (seçim varsa onun yerine) yerleştirir; konum
 * bilinmiyorsa sona ekler. `caret` eklenen metnin hemen sonrasıdır.
 */
export function insertAtCursor(
  value: string,
  snippet: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): { value: string; caret: number } {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    caret: start + snippet.length,
  };
}
