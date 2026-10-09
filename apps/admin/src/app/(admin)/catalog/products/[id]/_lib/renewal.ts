/**
 * Yönetici "yeniden yayına al" eylemi yalnız süresi dolduğu için kapanmış ilana
 * açılır (sunucu da aynısını zorlar: `inactiveReason = expired`). Elle pasife
 * alma, stok bitişi, karantina ve moderasyon kapanışları buraya girmez.
 */
export function canRenewExpiredListing(product: {
  status: string;
  inactiveReason?: string | null;
}): boolean {
  return product.status === "inactive" && product.inactiveReason === "expired";
}
