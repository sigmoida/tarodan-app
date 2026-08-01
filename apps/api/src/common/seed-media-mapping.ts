const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Seed ürünlerinin slug'ları kaynak görsel tabanını taşır:
 *   <asset>-<index>
 *   kurumsal-<asset>-<index>
 *   durum-<state>-<asset>
 *
 * Sadece bu kontrollü kalıpları kabul ederek normal kullanıcı ilanlarına
 * yanlışlıkla demo görseli bağlanmasını önler.
 */
export function resolveSeedProductAssetBase(
  productSlug: string,
  availableBases: readonly string[],
): string | null {
  const bases = [...availableBases].sort((a, b) => b.length - a.length);

  for (const base of bases) {
    const escaped = escapeRegExp(base);
    if (new RegExp(`^${escaped}-\\d+$`).test(productSlug)) return base;
    if (new RegExp(`^kurumsal-${escaped}-\\d+$`).test(productSlug)) return base;
    if (productSlug.startsWith("durum-") && productSlug.endsWith(`-${base}`)) {
      return base;
    }
  }

  return null;
}

export const seedCollectionAssetKey = (
  collectionSlug: string,
  prefix = "seed-assets",
): string => `${prefix}/collections/${collectionSlug}.webp`;

/**
 * Faz 1 — üretici (manufacturer) logoları: slug → kaynak dosya adı.
 * `scripts/upload-brand-logos.ts` bu eşlemeyle apps/web'in eski statik
 * dosyalarını `seed-assets/brands/{slug}.{ext}`e yükler; `seed-media.ts`
 * oradan env prefix'ine kopyalayıp `manufacturer.logo`ya S3 KEY yazar.
 */
export const SEED_BRAND_LOGO_FILES: Readonly<Record<string, string>> = {
  "hot-wheels": "2158430f294b152f30824d6bb1ac7bf9.jpg",
  matchbox: "images.png",
  majorette: "majorette-logo-png_seeklogo-492958.png",
  tomica: "Tomica_brand_textlogo.png",
  bburago: "Bburago_Logo.png",
  maisto: "maisto-logo.png",
  autoart: "download.png",
  minichamps: "minichamps_logo.png",
  kyosho: "Kyosho_corp_logo.png",
  cmc: "cmc_logo-640x320.jpg",
  "gt-spirit": "GT-Spirit-Logo.webp",
  schuco:
    "logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg",
  norev: "5bc0b46797d85-thumbnail.jpg",
  greenlight: "Greenlight_collectibles_logo.png",
  tamiya: "tamiya-logo-png_seeklogo-324507.png",
  "mini-gt": "mini-gt-logo-png_seeklogo-523421.png",
};

export const SEED_AVATAR_BY_EMAIL: Readonly<Record<string, string>> = {
  "admin@tarodan.com": "avatar-13.webp",
  "moderator@tarodan.com": "avatar-09.webp",
  "ahmet@demo.com": "avatar-04.webp",
  "mehmet@demo.com": "avatar-07.webp",
  "ayse@demo.com": "avatar-10.webp",
  "fatma@demo.com": "avatar-14.webp",
  "ali@demo.com": "avatar-05.webp",
  "zeynep@demo.com": "avatar-01.webp",
  "mustafa@demo.com": "avatar-12.webp",
  "elif@demo.com": "avatar-02.webp",
  "emre@demo.com": "avatar-08.webp",
  "selin@demo.com": "avatar-11.webp",
  "burak@demo.com": "avatar-16.webp",
  "deniz@demo.com": "avatar-17.webp",
  "ceren@demo.com": "avatar-03.webp",
  "kaan@demo.com": "avatar-18.webp",
  "irem@demo.com": "avatar-15.webp",
  "kurumsal@demo.com": "avatar-06.webp",
};
