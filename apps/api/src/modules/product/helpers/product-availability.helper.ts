/**
 * Müsait adet (available quantity) hesabı.
 * - quantity === null → sınırsız stok, null döner.
 * - quantity sayı ise → available = quantity - reservedQuantity (0'dan küçük olamaz).
 */
export function getAvailableQuantity(product: {
  quantity: number | null;
  reservedQuantity?: number | null;
}): number | null {
  if (product.quantity === null) {
    return null;
  }
  const reserved = product.reservedQuantity ?? 0;
  return Math.max(0, product.quantity - reserved);
}
