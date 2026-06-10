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
  if (p.status != null && p.status !== 'active') return true;
  if (p.availableQuantity != null && p.availableQuantity <= 0) return true;
  return false;
}
