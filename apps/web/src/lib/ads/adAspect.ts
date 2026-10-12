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
 * Yuvanın en/boy oranı: görsel yüklendiyse onun gerçek oranı (`naturalRatio`,
 * tarayıcıdan okunur); yüklenene kadar afişin kayıtlı `width/height` değeri
 * (yer ayırma, kayma olmasın); o da yoksa konum varsayılanı. Geçersiz/sıfır
 * ölçü yok sayılır.
 *
 * Kutu ile görselin oranı AYNI olmalı: tıklanabilir alanlar kutunun
 * yüzdesiyle yerleşir; görsel kutuya harf kutusuyla sığarsa alanlar kayar.
 * Kayıtlı ölçü admin'de IAB ön ayarıyla görselden bağımsız seçilebildiği için
 * yetkili olan görselin kendisidir.
 */
export function adAspectRatio(
  ad: { width: number | null; height: number | null },
  position: AdPosition,
  naturalRatio?: number | null,
): number {
  if (
    typeof naturalRatio === "number" &&
    Number.isFinite(naturalRatio) &&
    naturalRatio > 0
  ) {
    return naturalRatio;
  }
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

/** `<img>` yükleme olayından gerçek oran; ölçü okunamazsa null. */
export function naturalRatioOf(img: {
  naturalWidth: number;
  naturalHeight: number;
}): number | null {
  return img.naturalWidth > 0 && img.naturalHeight > 0
    ? img.naturalWidth / img.naturalHeight
    : null;
}
