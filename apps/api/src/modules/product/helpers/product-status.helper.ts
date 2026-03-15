import { ProductStatus } from '@prisma/client';

/**
 * quantity'dan product status belirler.
 * - quantity === null: sınırsız stok → ACTIVE
 * - quantity > 0: stok var → ACTIVE
 * - quantity === 0: stok bitti → INACTIVE
 */
export function getProductStatusFromQuantity(
  quantity: number | null,
): ProductStatus {
  if (quantity === null) {
    return ProductStatus.active;
  }
  return quantity > 0 ? ProductStatus.active : ProductStatus.inactive;
}
