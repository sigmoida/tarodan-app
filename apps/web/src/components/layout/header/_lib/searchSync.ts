/** @format */

const LISTINGS_PATH = "/listings";

/**
 * Başlıktaki arama kutusunun bu yolda göstermesi gereken metin.
 *
 * Arama kutusu düzen (layout) içinde yaşar, sayfa değişince sıfırlanmaz:
 * `/listings?search=x`'ten ana sayfaya dönünce "x" kalmasın diye `/listings`
 * dışındaki her yolda boş döner. `/listings`'te URL'deki `?search=` esastır
 * (çip kaldırılınca kutu da boşalır).
 */
export function headerSearchQueryFor(
  pathname: string,
  urlSearch: string | null,
): string {
  return pathname === LISTINGS_PATH ? urlSearch || "" : "";
}
