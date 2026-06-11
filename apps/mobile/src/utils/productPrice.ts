/**
 * Ürün fiyat kuralı — apps/web/src/lib/productPrice.ts paritesi.
 *
 * price = her zaman güncel satış fiyatı (API her yerde bunu döndürür).
 * oldPrice / originalPrice = indirim öncesi (üstü çizili gösterilecek).
 * salePrice alanı yalnızca indirim mekanizması için opsiyonel.
 */

export interface ProductPriceFields {
  price: number | string;
  oldPrice?: number | string | null;
  originalPrice?: number | string | null;
  salePrice?: number | string | null;
  isOnSale?: boolean;
}

/** Güncel satış fiyatı (API her zaman price döndürüyor) */
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

/** İndirim yüzdesi (ör. 25 → "%25 indirim"). İndirim yoksa 0. */
export function getProductDiscountPercent(p: ProductPriceFields): number {
  if (!isProductOnSaleDisplay(p)) return 0;
  const original = getProductOriginalPriceForDisplay(p);
  const current = getProductEffectivePrice(p);
  if (!original || original <= 0) return 0;
  return Math.round(((original - current) / original) * 100);
}

/**
 * Ürün stokta yok mu? — apps/web/src/lib/productPrice.ts paritesi.
 * - active dışı her statü (sold / inactive vb.) "stokta yok" sayılır.
 * - availableQuantity (quantity - reserved) <= 0 → stokta yok. null = sınırsız stok → stokta.
 */
export function isProductOutOfStock(p: {
  status?: string | null;
  availableQuantity?: number | null;
}): boolean {
  if (p.status != null && p.status !== 'active') return true;
  if (p.availableQuantity != null && p.availableQuantity <= 0) return true;
  return false;
}
