import type { ProductQueryDto } from "../dto";
import type { AccountLane } from "../../account-lane/account-lane";

/** GET /products liste cache'inin önek'i — `products:list:*` temizlikleri buna dayanır. */
export const PRODUCT_LIST_CACHE_PREFIX = "products:list:";

/**
 * GET /products liste cache anahtarı — DTO'daki TÜM alanlardan türetilir.
 *
 * Önceden anahtar alan alan elle yazılıyordu; yeni bir filtre (ör. `manufacturer`)
 * eklenip anahtara eklenmeyi unutulunca filtreli istek filtresiz listeyle aynı
 * cache girdisini paylaşıyordu (marka sayfasında başka ürünler / boş liste).
 * Artık sorgu nesnesinin kendisi anahtardır: ValidationPipe `whitelist` ile DTO
 * dışı alanları zaten düşürür, yani anahtar = sonucu değiştiren her filtre.
 *
 * - Alanlar sıralanır → query-string sırası farklı iki eşdeğer istek aynı anahtar.
 * - `undefined` alanlar düşer (JSON.stringify) → filtre yokken anahtar kısa kalır.
 * - Varsayılanlar (page=1, limit=20) normalize edilir → `?page=1` ile parametresiz
 *   istek aynı girdiyi paylaşır. Ham `status` korunur: undefined (kapsayıcı:
 *   aktif + tükenen + satıldı) ile 'active' farklı sonuç verir → `null` ile ayrılır.
 * - `hidden` (engelli satıcı özeti) yalnız doluysa, `lane` her zaman girer.
 */
export function buildProductListCacheKey(
  query: ProductQueryDto,
  ctx: { hidden?: string; lane: AccountLane },
): string {
  const normalized: Record<string, unknown> = {
    ...query,
    status: query.status ?? null,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    hidden: ctx.hidden,
    lane: ctx.lane,
  };
  const sorted = Object.fromEntries(
    Object.keys(normalized)
      .sort()
      .map((key) => [key, normalized[key]]),
  );
  return `${PRODUCT_LIST_CACHE_PREFIX}${JSON.stringify(sorted)}`;
}
