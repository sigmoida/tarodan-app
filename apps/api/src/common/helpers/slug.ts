import { transliterateTurkish } from "./turkish-text";

/**
 * Ad'dan URL slug'ı üretir — katalog genelindeki TEK slug kaynağı.
 * Kategori, koleksiyon, özellik, marka, üretici ve araç modeli aynı gövdeyi
 * kullanır; aksi halde içe aktarma ile elle ekleme aynı ad için farklı slug
 * üretir ve "zaten mevcut" kontrolleri birbirini tutmaz.
 *
 * Türkçe harfler ÇEVRİLİR, silinmez. Önceki gövde `[^\w\s-]` kullanıyordu ve
 * JS'te `\w` yalnızca `[A-Za-z0-9_]` olduğu için "Öz Çelik" → "z-elik",
 * "Şahin" → "ahin" gibi bozuk slug'lar üretiyordu.
 *
 * ASCII'ye indirgeme `turkish-text`e devredilmiştir: "ı"/"İ" NFD ile
 * ayrışmadığı için elle eşleme gerekiyor ve aynı tablo renk/attribute
 * eşleştirmesinde de kullanılıyor. İki kopya tutulsaydı biri harf eklendiğinde
 * diğeri sessizce geride kalırdı.
 */
export function generateSlug(text: string): string {
  return transliterateTurkish(text)
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
