/**
 * Admin'in iki dilde yazdığı içerik metni (hero slaytı, güven rozeti …) —
 * TEK kural. Türkçe zorunludur; İngilizce boş bırakılırsa Türkçeye düşülür.
 *
 * Kurallar admin formunda (anında geri bildirim) ve API'de (yetkili kaynak)
 * aynı fonksiyonla denetlenir: `validateLocalizedText`. İstemciler (web,
 * mobil) metni `pickLocalized` ile seçer — düşme kuralı tek yerde.
 */

export const LOCALIZED_TEXT_LOCALES = ["tr", "en"] as const;
export type LocalizedTextLocale = (typeof LOCALIZED_TEXT_LOCALES)[number];

export interface LocalizedText {
  tr: string;
  en?: string | null;
}

export type LocalizedTextErrorCode =
  /** Nesne değil, bilinmeyen dil anahtarı ya da metin olmayan değer. */
  | "invalid"
  /** Zorunlu alan boş. */
  | "required"
  /** İngilizce verilmiş ama Türkçe boş — Türkçe her zaman zorunlu. */
  | "trMissing"
  /** Dillerden biri sınırı aşıyor. */
  | "tooLong";

export interface LocalizedTextRules {
  maxLength: number;
  required: boolean;
}

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim().length === 0);

/**
 * İstenen dildeki metin; İngilizce boşsa Türkçe. Değer yoksa `""` — istemci
 * "metin yok" kararını boşluk üzerinden verir.
 */
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: LocalizedTextLocale | string,
): string {
  if (!text) return "";
  // İstemciler ham locale verir (`en-US`, `tr-TR`); yalnız iki dilimiz var.
  const wantsEn = String(locale).toLowerCase().startsWith("en");
  if (wantsEn && !isBlank(text.en)) return (text.en as string).trim();
  return typeof text.tr === "string" ? text.tr.trim() : "";
}

/**
 * Değer kurala uyuyor mu? Uyuyorsa `null`, uymuyorsa ilk hata kodu. `null` /
 * `undefined` ve iki dili de boş nesne "değer yok" sayılır (zorunlu değilse
 * geçerlidir; kaydeden taraf `normalizeLocalizedText` ile null'a indirir).
 */
export function validateLocalizedText(
  value: unknown,
  rules: LocalizedTextRules,
): LocalizedTextErrorCode | null {
  if (value === undefined || value === null) {
    return rules.required ? "required" : null;
  }
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";

  const record = value as Record<string, unknown>;
  const locales: readonly string[] = LOCALIZED_TEXT_LOCALES;
  if (Object.keys(record).some((key) => !locales.includes(key))) {
    return "invalid";
  }
  const { tr, en } = record;
  if (tr !== undefined && tr !== null && typeof tr !== "string") {
    return "invalid";
  }
  if (en !== undefined && en !== null && typeof en !== "string") {
    return "invalid";
  }

  if (isBlank(tr)) {
    if (!isBlank(en)) return "trMissing";
    return rules.required ? "required" : null;
  }
  const tooLong = [tr, en].some(
    (text) => typeof text === "string" && text.trim().length > rules.maxLength,
  );
  return tooLong ? "tooLong" : null;
}

/**
 * Kaydedilecek biçim: kenar boşlukları kırpılır, boş İngilizce `null` olur,
 * iki dil de boşsa (ya da değer yoksa) `null`. Yalnız
 * `validateLocalizedText`'ten geçmiş değere uygulanır.
 */
export function normalizeLocalizedText(
  value: LocalizedText | null | undefined,
): LocalizedText | null {
  if (!value || isBlank(value.tr)) return null;
  const en = isBlank(value.en) ? null : (value.en as string).trim();
  return { tr: value.tr.trim(), en };
}

/**
 * Saklanan JSON'u (veritabanı, ağ yanıtı) toleranslı okur: biçim bozuksa
 * `null`. Okuyan taraf asla şemaya güvenip çökmemeli.
 */
export function parseLocalizedText(value: unknown): LocalizedText | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { tr, en } = value as Record<string, unknown>;
  if (typeof tr !== "string" || tr.trim().length === 0) return null;
  return { tr, en: typeof en === "string" && en.trim() ? en : null };
}
