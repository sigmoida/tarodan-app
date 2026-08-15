/** @format */

import type { useTranslations } from "next-intl";
import { resolveStatusConfig, type StatusConfigDefMap } from "@tarodan/shared";

/**
 * next-intl'in kök çevirici tipi — `t`'yi parametre olarak alan yardımcılar
 * için. `t` anahtarı tipli genel bir fonksiyondur ve gevşek bir
 * `(key: string) => string` imzasına ATANAMAZ.
 */
export type Translate = ReturnType<typeof useTranslations<never>>;

/**
 * Paylaşılan durum haritalarının (`@tarodan/shared`) dile çözülmesi.
 *
 * Haritalar artık etiket değil KATALOG ANAHTARI taşır — paket i18n
 * kütüphanesinden bağımsız kalsın diye. Çözümü yapan taraf metni ekrana basan
 * uygulamadır; bu iki yardımcı o dönüşümün tek yeri.
 */

/** `StatusBadge` / `Badge` `config` propu ve `enumLabel` için çözülmüş harita. */
export const statusConfig = (def: StatusConfigDefMap, t: Translate) =>
  resolveStatusConfig(def, t);

/** Tek bir ham enum değerinin okunabilir etiketi. Eşleşme yoksa fallback. */
export function statusLabel(
  def: StatusConfigDefMap,
  value: string | null | undefined,
  t: Translate,
  fallback?: string,
): string {
  if (!value) return fallback ?? "—";
  const entry = def[value];
  return entry ? t(entry.labelKey) : (fallback ?? value);
}
