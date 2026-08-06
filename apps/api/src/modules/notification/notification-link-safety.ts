/**
 * Serbest bildirim linkinin güvenli olup olmadığı.
 *
 * `notification-link.ts`ten AYRI durur: DTO bu kontrolü kullanıyor, o modül ise
 * `NotificationType`ı DTO'dan alıyor. İkisi birbirini import edince döngü
 * oluşuyor ve modül yükleme sırasına göre biri `undefined` kalabiliyordu.
 */

/**
 * Doğrulamanın referans origin'i. Gerçek adres önemli değildir — iç yolun
 * BAŞKA bir origin'e kaçmadığını ölçmek için sabit bir tabana çözülür.
 */
const REFERENCE_ORIGIN = "https://tarodan.internal";

/**
 * Site içinde gidilebilecek canonical yollar.
 *
 * `/` ile başlayan her şeyi kabul etmek yetmiyordu: `/olmayan-bir-sayfa` de
 * geçiyordu, yani yönetici bildirimi hâlâ 404 üretebiliyordu.
 */
const ALLOWED_INTERNAL_PATHS: RegExp[] = [
  /^\/$/,
  /^\/listings(\/[^/]+)?$/,
  /^\/products\/unavailable\/[^/]+$/,
  /^\/collections(\/[^/]+)?$/,
  /^\/seller\/[^/]+$/,
  /^\/seller\/orders\/[^/]+$/,
  /^\/membership$/,
  /^\/profile$/,
  // Alt segmenti GERÇEKTEN olan iki bölüm (`[id]` route'u var).
  /^\/profile\/(orders|trades)(\/[^/]+)?$/,
  // Kalanlar yalnız liste ekranı: `/profile/offers/x` diye bir sayfa yok.
  /^\/profile\/(offers|messages|listings|favorites|payments|notifications)$/,
];

/**
 * Ters bölü ve kontrol karakterleri tarayıcıda farklı çözülür.
 *
 * Regex yerine kod noktası kontrolü: kontrol karakterlerini düzenli ifadeye
 * gömmek hem okunmaz hem de lint tarafından yasak (`no-control-regex`).
 */
const hasUnsafeChar = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return char === "\\" || code < 0x20 || code === 0x7f;
  });

/**
 * Yalnız HTTPS ya da İZİN VERİLEN site-içi yol.
 *
 * `/` ile başlayan her şeyi güvenli saymak yetmiyordu: tarayıcı
 * `/\evil.example/x` adresini `https://evil.example/x` olarak çözüyor, yani
 * ters bölü ile site DIŞINA çıkılabiliyordu. Bu yüzden yol sabit bir origin'e
 * karşı ayrıştırılır ve origin'in DEĞİŞMEDİĞİ doğrulanır.
 */
export function isSafeFreeLink(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed || trimmed.includes("{{")) return false;
  if (hasUnsafeChar(trimmed)) return false;
  if (trimmed.startsWith("//")) return false;

  if (trimmed.startsWith("/")) {
    let url: URL;
    try {
      url = new URL(trimmed, REFERENCE_ORIGIN);
    } catch {
      return false;
    }
    // Göreli çözüm başka bir origin'e kaçtıysa iç link değildir.
    if (url.origin !== REFERENCE_ORIGIN) return false;
    return ALLOWED_INTERNAL_PATHS.some((allowed) => allowed.test(url.pathname));
  }

  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}
