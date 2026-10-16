/** @format */

import { withReturnTo } from "./returnTo";

/**
 * Profil sayfasındaki "kapı" bölümleri — anchor id'leri TEK kaynak: bölümün
 * kendisi (`id=`) ve ona giden kapı linki aynı sabiti kullanır.
 */
export const PROFILE_GATE_SECTION = {
  bank: "bank-account",
  address: "addresses",
} as const;

export type ProfileGateSection = keyof typeof PROFILE_GATE_SECTION;

/**
 * Eksik bilgiyi tamamlatıp geri döndüren profil linki:
 * `/profile?returnTo=/listings/new#bank-account`. Kayıt sonrası dönüşü
 * `useReturnAfterSave` yapar.
 */
export function profileGateHref(
  section: ProfileGateSection,
  returnTo: string,
): string {
  return `${withReturnTo("/profile", returnTo)}#${PROFILE_GATE_SECTION[section]}`;
}
