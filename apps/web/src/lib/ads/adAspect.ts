/** @format */

import type { AdPosition } from "@/lib/api/advertisements";

/** Afişin kendi ölçüsü yoksa konuma göre varsayılan en/boy oranı. */
export const FALLBACK_AD_RATIO: Record<AdPosition, number> = {
  topbar: 970 / 90,
  header: 970 / 250,
  footer: 970 / 250,
  inline: 970 / 200,
  popup: 4 / 3,
};

/**
 * Yuvanın en/boy oranı: afişin kendi `width/height` değeri varsa o (kırpma
 * olmasın), yoksa konum varsayılanı. Geçersiz/sıfır ölçü yok sayılır.
 */
export function adAspectRatio(
  ad: { width: number | null; height: number | null },
  position: AdPosition,
): number {
  const { width, height } = ad;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return FALLBACK_AD_RATIO[position];
}
