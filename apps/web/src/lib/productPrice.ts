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
  const old = p.oldPrice != null ? Number(p.oldPrice) : (p.originalPrice != null ? Number(p.originalPrice) : null);
  const price = Number(p.price);
  return old != null && old > price;
}

/** Gösterilecek eski fiyat (üstü çizili) */
export function getProductOriginalPriceForDisplay(p: ProductPriceFields): number {
  const old = p.oldPrice != null ? Number(p.oldPrice) : (p.originalPrice != null ? Number(p.originalPrice) : null);
  return old ?? Number(p.price);
}
