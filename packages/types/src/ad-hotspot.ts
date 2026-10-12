/**
 * Reklam tıklanabilir alanları (hotspot) — TEK kaynak.
 *
 * Görselli reklamda tıklama YALNIZ admin'in görsel üzerine çizdiği alanlarda
 * olur; alan dışı tıklama bir yere gitmez. Koordinatlar görselin kesirleridir
 * (0–1): görsel hangi boyutta çizilirse çizilsin alan aynı yere denk gelir.
 *
 * Kurallar admin formunda (anında geri bildirim) ve API'de (yetkili kaynak)
 * aynı fonksiyonla denetlenir: `validateAdHotspots`.
 */

/** Bir reklamdaki en çok alan sayısı. */
export const AD_HOTSPOT_MAX = 10;
/** Alanın en küçük eni/boyu (görselin kesri) — parmakla tıklanamayacak alan olmasın. */
export const AD_HOTSPOT_MIN_SIZE = 0.03;
/** Alan adı (rapor + ekran okuyucu etiketi) en çok uzunluğu. */
export const AD_HOTSPOT_LABEL_MAX = 80;

/** Bir alanın görsel üzerindeki dikdörtgeni (sol üst köşe + en/boy, 0–1). */
export interface AdHotspotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AdHotspotInput extends AdHotspotRect {
  label: string;
  linkUrl: string;
}

export type AdHotspotErrorCode =
  | "tooMany"
  | "outOfBounds"
  | "tooSmall"
  | "overlap"
  | "labelRequired"
  | "labelTooLong"
  | "linkRequired";

export interface AdHotspotError {
  code: AdHotspotErrorCode;
  /** Hatalı alanın listedeki sırası (0 tabanlı); `tooMany` için yok. */
  index?: number;
  /** `overlap`: çakıştığı diğer alanın sırası. */
  otherIndex?: number;
}

/** Kayan nokta hatası yüzünden kenar kenara duran alanlar çakışık sayılmasın. */
const EPSILON = 1e-6;

/**
 * İki alan pozitif alanla kesişiyor mu? Kenarları değen alanlar çakışık
 * DEĞİLDİR (yan yana iki buton bırakılabilsin).
 */
export function adHotspotsOverlap(a: AdHotspotRect, b: AdHotspotRect): boolean {
  return (
    a.x < b.x + b.width - EPSILON &&
    b.x < a.x + a.width - EPSILON &&
    a.y < b.y + b.height - EPSILON &&
    b.y < a.y + a.height - EPSILON
  );
}

/** Alan görselin içinde mi (kesirler 0–1, taşma yok)? */
export function adHotspotInBounds(r: AdHotspotRect): boolean {
  const finite = [r.x, r.y, r.width, r.height].every(Number.isFinite);
  return (
    finite &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= 1 + EPSILON &&
    r.y + r.height <= 1 + EPSILON
  );
}

/**
 * Alan listesinin tüm kuralları. Boş liste geçerlidir (tıklanamaz görsel).
 * Bağlantının BİÇİMİ (http(s) / site içi yol) burada değil, bağlantı
 * doğrulayıcısında denetlenir; burada yalnız boş olmaması.
 */
export function validateAdHotspots(
  hotspots: readonly AdHotspotInput[],
): AdHotspotError[] {
  const errors: AdHotspotError[] = [];
  if (hotspots.length > AD_HOTSPOT_MAX) errors.push({ code: "tooMany" });

  hotspots.forEach((h, index) => {
    if (!adHotspotInBounds(h)) {
      errors.push({ code: "outOfBounds", index });
    } else if (
      h.width < AD_HOTSPOT_MIN_SIZE - EPSILON ||
      h.height < AD_HOTSPOT_MIN_SIZE - EPSILON
    ) {
      errors.push({ code: "tooSmall", index });
    }
    const label = h.label?.trim() ?? "";
    if (!label) errors.push({ code: "labelRequired", index });
    else if (label.length > AD_HOTSPOT_LABEL_MAX)
      errors.push({ code: "labelTooLong", index });
    if (!h.linkUrl?.trim()) errors.push({ code: "linkRequired", index });

    for (let other = 0; other < index; other += 1) {
      if (adHotspotsOverlap(hotspots[other], h)) {
        errors.push({ code: "overlap", index, otherIndex: other });
      }
    }
  });

  return errors;
}
