/**
 * A + oldPrice: price (A) = her zaman güncel satış fiyatı; API ve proje her yerde price çekiyor.
 * oldPrice = indirim öncesi (çizili). getProductEffectivePrice = price (A).
 */

export interface ProductPriceFields {
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
}

/** Güncel satış fiyatı (A) – API her zaman price döndürüyor */
export function getProductEffectivePrice(p: ProductPriceFields): number {
  return Number(p.price);
}

/** İndirimde mi (eski fiyat üstü çizili gösterilecek mi) */
export function isProductOnSaleDisplay(p: ProductPriceFields): boolean {
  if (p.isOnSale === true) return true;
  const old =
    p.oldPrice != null
      ? Number(p.oldPrice)
      : p.originalPrice != null
        ? Number(p.originalPrice)
        : null;
  const price = Number(p.price);
  return old != null && old > price;
}

/** Gösterilecek eski fiyat (üstü çizili) */
export function getProductOriginalPriceForDisplay(
  p: ProductPriceFields,
): number {
  const old =
    p.oldPrice != null
      ? Number(p.oldPrice)
      : p.originalPrice != null
        ? Number(p.originalPrice)
        : null;
  return old ?? Number(p.price);
}

/**
 * Kart ve detayda gösterilecek indirim yüzdesi (yuvarlanmış tam sayı) — TEK
 * kaynak. İndirimde değilse 0. Eski fiyat güncelden yüksekse yüzde HER ZAMAN
 * fiyatlardan hesaplanır (üstü çizili fiyatla tutarlı kalsın); fiyatlardan
 * hesaplanamıyorsa API'nin `discountPercent`'ine düşülür. Sonuç 1'in altındaysa
 * rozet çizilmez (çağıran `percent >= 1` kontrol eder) — asla "%0" gösterilmez.
 */
export function getProductDiscountPercent(
  p: ProductPriceFields & { discountPercent?: number | null },
): number {
  if (!isProductOnSaleDisplay(p)) return 0;
  const old = getProductOriginalPriceForDisplay(p);
  const price = getProductEffectivePrice(p);
  if (old > price) return Math.round(((old - price) / old) * 100);
  const declared = Number(p.discountPercent);
  return declared > 0 ? Math.round(declared) : 0;
}

/**
 * Gerçek indirim var mı: eski fiyat, güncel fiyattan kesin olarak yüksek.
 * API bazen %0 / hatalı fiyat döndürebildiği için ana sayfa "İndirimdekiler"
 * rail'i ve server prefetch'i bu tek kaynağı kullanır.
 */
export function hasRealDiscount(p: ProductPriceFields): boolean {
  return (
    isProductOnSaleDisplay(p) &&
    getProductOriginalPriceForDisplay(p) > getProductEffectivePrice(p)
  );
}

/**
 * Ürün stokta yok mu?
 * - active dışı her statü (sold / inactive vb.) "stokta yok" sayılır.
 * - availableQuantity (quantity - reserved) <= 0 → stokta yok. null = sınırsız stok → stokta.
 * Listelerde "Stokta yok" rozeti ve detayda pasif satın al için tek kaynak.
 */
export function isProductOutOfStock(p: {
  status?: string | null;
  availableQuantity?: number | null;
}): boolean {
  if (p.status != null && p.status !== "active") return true;
  if (p.availableQuantity != null && p.availableQuantity <= 0) return true;
  return false;
}
