/**
 * A + oldPrice: price (A) = always the current sale price (consistent with web).
 */

export interface ProductPriceFields {
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
}

/** Current sale price (A) */
export function getProductEffectivePrice(p: ProductPriceFields): number {
  return Number(p.price);
}

/** Is it on sale (should the old price be shown struck through) */
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

/** Old price to display (struck through) */
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
