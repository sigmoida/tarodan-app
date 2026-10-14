import type { MessageKey, MessageValues } from "@tarodan/i18n";

/** "Son N ürün" uyarısının gösterildiği müsait stok üst sınırı. */
export const CART_LOW_STOCK_THRESHOLD = 5;

/** Sepet satırının stok uyarısı — katalog anahtarı + ICU parametreleri. */
export interface CartStockWarning {
  key: MessageKey;
  values?: MessageValues;
}

/**
 * Sepet satırı stok uyarısı (tek kaynak). Gerçek müsait adet gösterilir:
 * - 0 → "Stokta yok" (satır satın alınamaz)
 * - sepetteki adetten az → "Stokta sadece {count} adet var"
 * - eşik ve altı → "Son {count} ürün" (1 adette "Son 1 ürün")
 * `available === null` sınırsız stoktur → uyarı yok.
 */
export function cartStockWarning(
  available: number | null,
  quantity: number,
): CartStockWarning | undefined {
  if (available === null) return undefined;
  if (available <= 0) return { key: "server.cart.outOfStock" };
  if (available < quantity) {
    return {
      key: "server.cart.onlyCountInStock",
      values: { count: available },
    };
  }
  if (available <= CART_LOW_STOCK_THRESHOLD) {
    return { key: "server.cart.lastItems", values: { count: available } };
  }
  return undefined;
}
