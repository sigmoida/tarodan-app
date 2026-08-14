import { DiscountScope } from "@prisma/client";

/**
 * Bir indirimin KAPSAMI bu ürüne uyuyor mu? Saf kural; hem kupon doğrulaması hem
 * otomatik kampanya çözümü aynı kaynağı okur (iki yerde ayrı yazıldığında sepet
 * ile vitrin farklı ürünleri indirimli sayabiliyordu).
 */
export interface ScopedProduct {
  id: string;
  categoryId: string | null;
  sellerId: string;
}

export interface ScopedDiscount {
  scope: DiscountScope;
  sellerId: string | null;
  categoryId: string | null;
  targetProductIds: string[];
}

export function isProductInDiscountScope(
  product: ScopedProduct,
  discount: ScopedDiscount,
): boolean {
  switch (discount.scope) {
    case DiscountScope.global:
      return (
        discount.sellerId === null || discount.sellerId === product.sellerId
      );

    case DiscountScope.category:
      return (
        product.categoryId != null && product.categoryId === discount.categoryId
      );

    case DiscountScope.product:
      // Seçili ürünler: boş liste = hiçbir ürüne uygulanmaz.
      if (!discount.targetProductIds?.length) return false;
      return discount.targetProductIds.includes(product.id);

    case DiscountScope.seller:
      return (
        discount.sellerId != null && product.sellerId === discount.sellerId
      );

    default:
      return false;
  }
}
