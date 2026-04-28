import { ProductStatus } from '@prisma/client';

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

/**
 * reservedQuantity'yi güvenli biçimde azaltır; sonuç asla 0'ın altına düşmez.
 * Birden fazla serviste { decrement: qty } yerine kullanılmalıdır.
 */
export function safeDecrementReserved(
  current: number | null | undefined,
  by: number,
): number {
  return Math.max(0, (current ?? 0) - by);
}

/**
 * Sepete ekleme / sepet satırı güncelleme (Amazon modeli):
 * Burada sadece aynı kullanıcının talep ettiği adet, fiziksel stok üst sınırını
 * aşmamalıdır (quantity === null → sınırsız).
 */
export function canAddRequestedQuantityToCart(
  product: { quantity: number | null | undefined },
  requestedQty: number,
): boolean {
  if (product.quantity === null || product.quantity === undefined) {
    return true;
  }
  return product.quantity >= requestedQty;
}
