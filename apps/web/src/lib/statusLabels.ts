/** @format */

import { resolveStatusConfig, type StatusConfigDefMap } from "@tarodan/shared";
import type { Translate } from "@/types/i18n";

/**
 * Paylaşılan durum haritalarının (`@tarodan/shared`) dile çözülmesi.
 *
 * Haritalar artık etiket değil KATALOG ANAHTARI taşır — paket i18n
 * kütüphanesinden bağımsız kalsın diye. Çözümü yapan taraf metni ekrana basan
 * uygulamadır; bu iki yardımcı o dönüşümün tek yeri.
 */

/** `StatusBadge` / `Badge` `config` propu için çözülmüş harita. */
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
