/**
 * Marka cache anahtarları — tek kaynak. `BrandService` bunları yazar,
 * admin tarafındaki yazma işlemleri (tekil CRUD + toplu içe aktarma) temizler.
 *
 * Anahtarlar burada durmasaydı admin tarafı "brands:*" desenini elle tekrar
 * eder ve `BrandService` bir anahtar eklediğinde sessizce bayat veri kalırdı.
 */
export const BRANDS_ALL_CACHE_KEY = "brands:all";

export const brandSlugCacheKey = (slug: string) => `brands:slug:${slug}`;

/** `CacheService.delPattern` için: marka ile ilgili TÜM anahtarları kapsar. */
export const BRANDS_CACHE_PATTERN = "brands:*";
