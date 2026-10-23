/**
 * Serbest bildirim linkinin (yönetici yayını `data.link`, kampanya linkleri)
 * güvenlik kuralı — API doğrulayıcısı ile admin formunun TEK kaynağı.
 *
 * Kabul edilen: HTTPS adresi ya da İZİN VERİLEN site-içi yol. Mobil uygulama
 * site-içi yolları kendi ekranlarına çevirir (tarodan-mobile
 * `src/utils/notificationRoute.ts`); dış HTTPS adresi uygulamada açılmaz,
 * dokunuş bildirim listesine düşer.
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
export const NOTIFICATION_INTERNAL_PATHS: readonly RegExp[] = [
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
  // The rest are list screens only: there is no `/profile/offers/x` page.
  // `boosts` is "My boosts" (web only, ADR 0015), the target of boost notices.
  /^\/profile\/(offers|messages|listings|boosts|favorites|payments|notifications)$/,
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
 * İzin verilen SİTE-İÇİ yol mu (`/listings/123`, `/profile/orders` …)?
 * Sorgu dizesi serbesttir; yol kısmı izin listesinde olmalıdır.
 */
export function isInternalNotificationPath(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed || trimmed.includes("{{")) return false;
  if (hasUnsafeChar(trimmed)) return false;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return false;
  let url: URL;
  try {
    url = new URL(trimmed, REFERENCE_ORIGIN);
  } catch {
    return false;
  }
  // Göreli çözüm başka bir origin'e kaçtıysa iç link değildir.
  if (url.origin !== REFERENCE_ORIGIN) return false;
  return NOTIFICATION_INTERNAL_PATHS.some((allowed) =>
    allowed.test(url.pathname),
  );
}

/**
 * Yalnız HTTPS ya da İZİN VERİLEN site-içi yol.
 *
 * `/` ile başlayan her şeyi güvenli saymak yetmiyordu: tarayıcı
 * `/\evil.example/x` adresini `https://evil.example/x` olarak çözüyor, yani
 * ters bölü ile site DIŞINA çıkılabiliyordu. Bu yüzden yol sabit bir origin'e
 * karşı ayrıştırılır ve origin'in DEĞİŞMEDİĞİ doğrulanır.
 */
export function isSafeNotificationLink(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed || trimmed.includes("{{")) return false;
  if (hasUnsafeChar(trimmed)) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/")) return isInternalNotificationPath(trimmed);
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}
