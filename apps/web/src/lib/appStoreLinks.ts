/** @format */

/**
 * Ana sayfa hero'sundaki mobil uygulama tanıtım slaytı açık mı. Varsayılan
 * KAPALI: mağaza sayfaları herkese açık olana kadar prod'da kapalı kalır,
 * staging'de `"true"`. Derleme anında gömülür (değişince yeniden build).
 */
export const APP_PROMO_ENABLED =
  process.env.NEXT_PUBLIC_APP_PROMO_ENABLED === "true";

/**
 * Tarodan mobil uygulamasının mağaza sayfaları — sitede tek kaynak.
 *
 * - iOS: App Store Connect'teki prod uygulamanın Apple ID'si
 *   (`tarodan-mobile/eas.json` → `submit.production.ios.ascAppId`).
 * - Android: prod paket adı `com.tarodan.app`
 *   (`public/.well-known/assetlinks.json` ile aynı).
 *
 * Marka adları çevrilmez; görünen metin bu yüzden katalogda değil burada.
 */
export const APP_STORE_LINKS = [
  {
    id: "ios",
    storeName: "App Store",
    href: "https://apps.apple.com/tr/app/id6786614139",
  },
  {
    id: "android",
    storeName: "Google Play",
    href: "https://play.google.com/store/apps/details?id=com.tarodan.app",
  },
] as const;
