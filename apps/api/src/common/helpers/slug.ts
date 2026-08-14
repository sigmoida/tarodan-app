/**
 * Ad'dan URL slug'ı üretir — katalog genelindeki TEK slug kaynağı.
 * Kategori, koleksiyon, özellik, marka, üretici ve araç modeli aynı gövdeyi
 * kullanır; aksi halde içe aktarma ile elle ekleme aynı ad için farklı slug
 * üretir ve "zaten mevcut" kontrolleri birbirini tutmaz.
 *
 * Türkçe harfler ÇEVRİLİR, silinmez. Önceki gövde `[^\w\s-]` kullanıyordu ve
 * JS'te `\w` yalnızca `[A-Za-z0-9_]` olduğu için "Öz Çelik" → "z-elik",
 * "Şahin" → "ahin" gibi bozuk slug'lar üretiyordu.
 */

/**
 * Türkçe harfler için elle eşleme: "ı" ve "İ" NFD ile ayrışmaz (ya da yanlış
 * ayrışır), bu yüzden genel aksan temizliği tek başına yetmez.
 */
const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  Ç: "c",
  Ğ: "g",
  İ: "i",
  Ö: "o",
  Ş: "s",
  Ü: "u",
};

/** NFD ayrıştırmasından artan birleşik aksan işaretleri. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function generateSlug(text: string): string {
  const transliterated = text
    .split("")
    .map((char) => TR_MAP[char] ?? char)
    .join("");

  // Kalan Latin aksanlarını (é, ñ, å …) taban harfe indir.
  const ascii = transliterated.normalize("NFD").replace(COMBINING_MARKS, "");

  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * Araç modeli slug'ı = marka slug'ı + model adı (`dodge-charger`).
 * `CarModel.slug` @unique olduğu için bu türetim, şemada bulunmayan
 * `@@unique([brandId, name])` kısıtının yerine geçen fiilî tekillik
 * garantisidir — elle ekleme, içe aktarma ve seed AYNI gövdeyi kullanmalı.
 */
export function carModelSlug(brandSlug: string, name: string): string {
  return generateSlug(`${brandSlug}-${name}`);
}
