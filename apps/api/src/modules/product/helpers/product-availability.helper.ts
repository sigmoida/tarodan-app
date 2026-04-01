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
