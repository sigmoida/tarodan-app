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

/**
 * Yeniden yayına alma (tekil + toplu) moderatöre kapalıdır: yönetici kararı
 * onay sayılır. Sunucudaki `@Roles` ile aynı küme — yalnız arayüzü gizler,
 * asıl kapı API'dedir.
 */
const RENEW_ROLES: readonly string[] = ["super_admin", "admin"];

export function canRenewByRole(role: string | null | undefined): boolean {
  return !!role && RENEW_ROLES.includes(role);
}
