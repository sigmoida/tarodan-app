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

/**
 * Rezerv-duyarlı status (Bulgu C). Rezervasyon serbest bırakma yollarında
 * (timeout cron'ları) kullanılır. Status'u `available = quantity - reserved`'a göre verir:
 * - quantity === null (sınırsız) → ACTIVE (asla "reserved"a düşmez).
 * - available > 0 → ACTIVE (hâlâ satılabilir; rezerv kalsa bile gizleme).
 * - available <= 0 && quantity > 0 → RESERVED (rezerv tutuyor, geçici görünmez).
 * - available <= 0 && quantity === 0 → INACTIVE (gerçekten tükendi; "reserved" limbosu DEĞİL).
 *
 * Eski satır-içi ternary `newReserved > 0 ? reserved : (remaining > 0 ? active : reserved)`
 * quantity=0 ve quantity=null durumlarında yanlışlıkla "reserved" üretiyordu.
 */
export function getReservedAwareStatus(
  quantity: number | null,
  reservedQuantity: number,
): ProductStatus {
  if (quantity === null) {
    return ProductStatus.active;
  }
  const available = quantity - reservedQuantity;
  if (available > 0) {
    return ProductStatus.active;
  }
  return quantity > 0 ? ProductStatus.reserved : ProductStatus.inactive;
}
