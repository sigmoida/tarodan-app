import { z } from "zod";
import type { LocalizedText } from "@tarodan/types";

/**
 * TR/EN çift dilli alanların form temsili. `Form*` sarmalayıcıları hata
 * aramasını düz anahtarla (`formState.errors[name]`) yaptığı için iç içe
 * `title.tr` yerine düz `titleTr` / `titleEn` alanları kullanılır.
 */
export const LOCALE_LANGS = ["tr", "en"] as const;
export type LocaleLang = (typeof LOCALE_LANGS)[number];

export const localizedKey = (base: string, lang: LocaleLang): string =>
  `${base}${lang === "tr" ? "Tr" : "En"}`;

/** Kayıtlı `LocalizedText` → iki düz form alanı. */
export function localizedToForm<K extends string>(
  base: K,
  value?: LocalizedText | null,
): Record<`${K}Tr` | `${K}En`, string> {
  return {
    [`${base}Tr`]: value?.tr ?? "",
    [`${base}En`]: value?.en ?? "",
  } as Record<`${K}Tr` | `${K}En`, string>;
}

/** Bir çift alanın zod şeması (yalnız uzunluk; zorunluluk `addLocalizedIssues`'ta). */
export function localizedShape<K extends string>(
  base: K,
  max: number,
  maxMessage: string,
) {
  const text = z.string().max(max, maxMessage).optional().default("");
  return { [`${base}Tr`]: text, [`${base}En`]: text } as Record<
    `${K}Tr` | `${K}En`,
    typeof text
  >;
}

export interface LocalizedIssueMessages {
  /** TR boşken gösterilen (zorunlu alan). */
  required: string;
  /** EN dolu, TR boş. */
  trRequiredForEn: string;
}

/**
 * Çift dil kuralları: zorunluysa TR dolu olmalı; EN yalnız TR ile birlikte
 * gelebilir (yedek metin her zaman TR'dir).
 */
export function addLocalizedIssues(
  ctx: z.RefinementCtx,
  values: Record<string, unknown>,
  base: string,
  required: boolean,
  messages: LocalizedIssueMessages,
): void {
  const tr = String(values[localizedKey(base, "tr")] ?? "").trim();
  const en = String(values[localizedKey(base, "en")] ?? "").trim();
  if (!tr && required) {
    ctx.addIssue({
      code: "custom",
      path: [localizedKey(base, "tr")],
      message: messages.required,
    });
  } else if (!tr && en) {
    ctx.addIssue({
      code: "custom",
      path: [localizedKey(base, "tr")],
      message: messages.trRequiredForEn,
    });
  }
}

/**
 * Form alanları → API değeri. Boş TR: oluşturmada alan atlanır (`undefined`),
 * güncellemede `null` gider (API temizler). Boş EN her zaman `null`.
 */
export function localizedFromForm(
  values: Record<string, unknown>,
  base: string,
  mode: "create" | "update",
): LocalizedText | null | undefined {
  const tr = String(values[localizedKey(base, "tr")] ?? "").trim();
  const en = String(values[localizedKey(base, "en")] ?? "").trim();
  if (!tr) return mode === "update" ? null : undefined;
  return { tr, en: en || null };
}
