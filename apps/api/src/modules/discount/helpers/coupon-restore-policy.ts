/**
 * "Kupon yanar mı, geri gelir mi?" sorusunun TEK kaynağı.
 *
 * Kural, takas sürecinde benimsenen ilkenin aynısıdır: **kusursuz taraf bir şey
 * kaybetmez.** Alışverişi alıcı bozduysa (vazgeçme, kendi iptali) kupon hakkı
 * harcanmış sayılır; kusur satıcıda, kargoda, stokta ya da platformdaysa alıcının
 * kuponu geri verilir. Aksi halde alıcı hem ürünü alamıyor hem hakkını
 * kaybediyordu — destek ekibine en sık gelen şikâyet buydu.
 */

/** İade motorunun kusur tarafı (`RefundFaultParty` ile aynı değerler). */
export type CouponFaultParty = "buyer" | "seller" | "carrier" | "platform";

/**
 * Alıcı kaynaklı iptal kategorileri — `deriveCancelCategory` çıktısıyla aynı
 * sözlük. Listede olmayan bir kategori (satıcı, stok, admin, tanınmayan) alıcı
 * lehine yorumlanır: kupon iadesi platformun cebindendir, kusursuz alıcıyı
 * cezalandırmamak daha güvenlidir.
 */
export const BUYER_FAULT_CANCEL_CATEGORIES = new Set([
  "buyer_cancelled",
  "payment_timeout",
]);

/** Kusur alıcıdaysa kupon yanar. */
export function couponSurvivesFault(fault?: CouponFaultParty | null): boolean {
  return fault !== "buyer";
}

/**
 * İptal kategorisine göre: alıcının kendi iptali ve ödeme süresi aşımı dışındaki
 * her kategori (satıcı kargoya vermedi, stok bitti, takas rezervi, admin iptali)
 * kuponu geri verir.
 *
 * Not: ödeme süresi aşımında zaten tahsilat yoktur — kupon "kullanılmış" bile
 * sayılmaz, rezervasyonu serbest bırakılır. Buradaki liste yalnız ödenmiş
 * siparişin iptal/iadesi için anlamlıdır.
 */
export function couponSurvivesCancelCategory(
  category?: string | null,
): boolean {
  if (!category) return false;
  return !BUYER_FAULT_CANCEL_CATEGORIES.has(category);
}
