/**
 * Google Ads (gtag.js) — rızaya bağlı kurulum ve Consent Mode v2 köprüsü.
 *
 * KVKK duruşu cookieConsent.ts envanter notuyla aynı: üçüncü taraf script'i
 * yalnız `marketing` kategorisine rıza verildiğinde yüklenir; rıza yokken
 * Google'a hiçbir istek gitmez (Consent Mode'un çerezsiz ping'i dahil).
 * Yüklenirken `default` sinyalleri kayıtlı tercihten basılır; sonradan geri
 * çekilen rıza `saveConsent` → `updateGtagConsent` ile anında Google'a yansır
 * ve `_gcl_*` çerezleri temizlenir.
 *
 * window.gtag'in TEK tip tanımı ve sinyal haritasının TEK kaynağı burasıdır.
 * cookieConsent.ts buradan çağırır; buranın cookieConsent'e bağımlılığı yalnız
 * tip düzeyindedir (çalışma zamanında döngü yok).
 */

import type { CookiePreferences } from "./cookieConsent";

export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

/**
 * Tercihlerin Google Consent Mode v2 sinyal karşılığı — ilk yüklemedeki
 * `default` ve her kayıttaki `update` aynı haritayı kullanır.
 */
export function consentModeSignals(prefs: CookiePreferences) {
  return {
    security_storage: "granted",
    functionality_storage: prefs.functional ? "granted" : "denied",
    personalization_storage: prefs.functional ? "granted" : "denied",
    analytics_storage: prefs.analytics ? "granted" : "denied",
    ad_storage: prefs.marketing ? "granted" : "denied",
    ad_user_data: prefs.marketing ? "granted" : "denied",
    ad_personalization: prefs.marketing ? "granted" : "denied",
  } as const;
}

/** Rıza durumunu yüklü gtag'e bildirir; gtag yoksa sessizce geçer. */
export function updateGtagConsent(prefs: CookiePreferences) {
  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== "function") return;
  gtag("consent", "update", consentModeSignals(prefs));
}

let initialized = false;

/**
 * gtag kuyruğunu kurar ve `consent default` → `js` → `config` sırasını basar.
 * gtag.js yüklendiğinde kuyruğu bu sırayla işler; default'un config'den önce
 * gelmesi Consent Mode'un çalışma şartıdır. Idempotent — banner kaydından
 * sonra tekrar tetiklenmesi zararsızdır.
 */
export function initGoogleAdsTag(adsId: string, prefs: CookiePreferences) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    // gtag.js kuyruğu gerçek `arguments` nesnesi bekler; rest-param dizisi
    // push'lamak komutların sessizce yutulmasına yol açar.
    // eslint-disable-next-line prefer-rest-params
    w.gtag = function gtag() {
      w.dataLayer?.push(arguments);
    };
  }
  w.gtag("consent", "default", consentModeSignals(prefs));
  w.gtag("js", new Date());
  w.gtag("config", adsId);
}
