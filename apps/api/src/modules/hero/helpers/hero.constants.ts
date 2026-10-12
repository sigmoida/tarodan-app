import type { HeroPlacement } from "@tarodan/types";
import type { UploadOptions } from "../../media/media.service";

/**
 * Hero görseli yükleme hedefi — TEK tanım (`POST /admin/hero-slides/upload`,
 * yalnız `ads` izni). Public `products` kökü, `hero/` klasörü: görsel kalıcı
 * public URL ile web'de ve mobilde açılır. Geniş ekran görseli en çok 2400 px
 * ene indirilir (retina 1200 px slider), küçük görsel büyütülmez.
 */
export const HERO_IMAGE_UPLOAD: UploadOptions = {
  bucket: "products",
  folder: "hero",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 5MB
  resize: { width: 2400, fit: "inside", withoutEnlargement: true },
};

/**
 * Web'in ISR önbellek etiketleri (`notifyWebRevalidate`). Ana sayfa slider'ı
 * ile auth görseli ayrı sayfalarda render edilir; yalnız değişen yüzey
 * tazelenir.
 */
export const HERO_REVALIDATE_TAG_BY_PLACEMENT: Readonly<
  Record<HeroPlacement, string>
> = {
  home: "home:hero",
  auth_default: "auth:hero",
  auth_register: "auth:hero",
};

export const TRUST_BADGE_REVALIDATE_TAG = "home:trust";

/** Değişen yerleşimlerin etiketleri (tekrarsız). */
export function heroRevalidateTags(
  placements: readonly HeroPlacement[],
): string[] {
  return [
    ...new Set(placements.map((p) => HERO_REVALIDATE_TAG_BY_PLACEMENT[p])),
  ];
}

/**
 * Herkese açık GET'lerin önbellek başlığı: içerik admin'den nadiren değişir;
 * kısa ömür, zamanlanmış slaytın en geç bir dakikada görünmesini sağlar.
 */
export const HERO_PUBLIC_CACHE_CONTROL = "public, max-age=60";
