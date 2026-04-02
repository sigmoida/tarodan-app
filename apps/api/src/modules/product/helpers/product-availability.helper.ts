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
 * Rezervasyon serbest bırakıldıktan sonra ürünün doğru statüsünü belirler.
 * - newReservedQuantity > 0  → başka rezervasyonlar var, RESERVED kal
 * - newReservedQuantity === 0 ve quantity === null → sınırsız stok, ACTIVE
 * - newReservedQuantity === 0 ve quantity > 0     → stok var, ACTIVE
 * - newReservedQuantity === 0 ve quantity === 0   → stok bitti, INACTIVE
 *
 * Önemli: quantity parametresi, ilgili işlem (satış/takas tamamlama) sonrası
 * güncel fiziksel stok miktarı olmalıdır.
 */
export function getStatusAfterReservationRelease(
  currentQuantity: number | null,
  newReservedQuantity: number,
): ProductStatus {
  if (newReservedQuantity > 0) return ProductStatus.reserved;
  if (currentQuantity === null || currentQuantity > 0) return ProductStatus.active;
  return ProductStatus.inactive;
}

/**
 * Sepete ekleme / sepet satırı güncelleme (Amazon modeli):
 * Rezervasyonu (reservedQuantity) dikkate alma — çoklu kullanıcı aynı SKU’yu sepete
 * koyabilir; rezervasyon yalnızca sipariş oluşturma (checkout) anında yapılır.
 *
 * Burada sadece aynı kullanıcının talep ettiği adet, fiziksel stok üst sınırını
 * aşmamalıdır (quantity === null → sınırsız).
 */
export function canAddRequestedQuantityToCart(
  product: { quantity: number | null | undefined },
  requestedQty: number,
): boolean {
  // null / undefined = sınırsız stok (şemada quantity boş)
  if (product.quantity === null || product.quantity === undefined) {
    return true;
  }
  return product.quantity >= requestedQty;
}
