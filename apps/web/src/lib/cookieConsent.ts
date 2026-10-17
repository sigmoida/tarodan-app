/**
 * Çerez rızası — tek kaynak.
 *
 * Hem alt taraftaki onay banner'ı hem de /cookies sayfasındaki tercih paneli
 * buradaki kategori tanımlarını, envanteri ve kalıcılık mantığını kullanır.
 * Daha önce ikisi ayrı tipler (`necessary/analytics/marketing` vs
 * `functional/analytics/marketing`) ve ayrı kayıt yolları kullandığı için
 * panelden yapılan kayıt banner'ın tercihini bozuyordu.
 */

import { CONSENT_DOCUMENTS } from "@tarodan/types";
import type { Translate } from "@/types/i18n";
import { GOOGLE_ADS_ID, updateGtagConsent } from "./googleAds";

export type CookieCategory =
  "necessary" | "functional" | "analytics" | "marketing";

export type CookiePreferences = Record<CookieCategory, boolean> & {
  timestamp?: string;
};

/** KVKK/GDPR opt-in: zorunlu dışındaki her kategori varsayılan olarak kapalı. */
export const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export const ALL_ACCEPTED: CookiePreferences = {
  necessary: true,
  functional: true,
  analytics: true,
  marketing: true,
};

export const CONSENT_KEY = "cookie_consent";
export const PREFERENCES_KEY = "cookie_preferences";
/**
 * Rızanın verildiği Çerez Politikası sürümü. Politika değişince
 * (`CONSENT_DOCUMENTS.cookies.version`) kayıtlı rıza geçersiz sayılır ve bant
 * yeniden çıkar — hesap belgelerindeki yeniden-onay kuralının çerez karşılığı.
 */
export const CONSENT_VERSION_KEY = "cookie_consent_version";
/**
 * Giriş yapmamış ziyaretçinin kalıcı kimliği: sunucudaki onay kaydının sahibi.
 * Kişisel veri değil, rastgele bir UUID; yalnız rıza kanıtı için tutulur.
 */
export const VISITOR_ID_KEY = "cookie_consent_visitor";

/**
 * `saveConsent` her kayıttan sonra bu olayı yayar. Rızaya bağlı yüklenen
 * script'ler (ör. GoogleAdsTag) banner/panel hangi bileşende olursa olsun
 * kararı buradan duyar — hook state'i bileşen-yerel olduğu için tek köprü bu.
 */
export const CONSENT_CHANGED_EVENT = "tarodan:cookie-consent-changed";

/** Rıza kaydının yasal ispat süresi (PDF: "Çerez Rıza ve Tercih Logları — 1 Yıl"). */
const CONSENT_MAX_AGE_DAYS = 365;

export interface CookieEntry {
  name: string;
  purpose: string;
  duration: string;
  /** Henüz kurulmamış üçüncü taraf çerezleri panelde "Pasif" olarak işaretlenir. */
  active?: boolean;
}

export interface CookieCategoryInfo {
  id: CookieCategory;
  name: string;
  description: string;
  required?: boolean;
  cookies: CookieEntry[];
}

/**
 * Platformda gerçekten yazılan çerez/yerel depolama envanteri. Üçüncü taraf
 * ölçümleme ve piksel çerezleri politika kapsamında beyan edilir; script'leri
 * yalnızca ilgili kategoriye rıza verildiğinde yüklenir.
 *
 * Çerez ADLARI teknik tanımlayıcıdır ve çevrilmez; görünen her metin katalogdan
 * gelir, o yüzden envanter bir `t`-parametreli kurucudur (modül düzeyinde sabit
 * olsaydı hook kuralını ihlal ederdi).
 */
export function cookieCategories(t: Translate): CookieCategoryInfo[] {
  return [
    {
      id: "necessary",
      name: t("legal.necessaryCookies"),
      description: t("legal.cookies.necessaryDesc"),
      required: true,
      cookies: [
        {
          name: "web_at / web_rt",
          purpose: t("legal.cookies.purpose.sessionAuth"),
          duration: t("legal.cookies.duration.min15Or7d"),
          active: true,
        },
        {
          name: "access_token / refresh_token",
          purpose: t("legal.cookies.purpose.apiSession"),
          duration: t("legal.cookies.duration.min15Or7d"),
          active: true,
        },
        {
          name: "csrf_token",
          purpose: t("legal.cookies.purpose.csrf"),
          duration: t("legal.cookies.duration.d7"),
          active: true,
        },
        {
          name: "tarodan_authed",
          purpose: t("legal.cookies.purpose.authIndicator"),
          duration: t("legal.cookies.duration.d7"),
          active: true,
        },
        {
          name: "cookie_consent / cookie_preferences / cookie_consent_version / cookie_consent_visitor",
          purpose: t("legal.cookies.purpose.consentRecord"),
          duration: t("legal.cookies.duration.y1"),
          active: true,
        },
        {
          name: "site_unlock",
          purpose: t("legal.cookies.purpose.siteUnlock"),
          duration: t("legal.cookies.duration.d10"),
          active: true,
        },
        {
          name: "auth-storage / tarodan_user_snapshot",
          purpose: t("legal.cookies.purpose.userSnapshot"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
      ],
    },
    {
      id: "functional",
      name: t("legal.functionalCookies"),
      description: t("legal.cookies.functionalDesc"),
      cookies: [
        {
          name: "NEXT_LOCALE",
          purpose: t("legal.cookies.purpose.languagePreference"),
          duration: t("legal.cookies.duration.y1"),
          active: true,
        },
        {
          name: "cart-storage",
          purpose: t("legal.cookies.purpose.guestCart"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
        {
          name: "recent-searches",
          purpose: t("legal.cookies.purpose.recentSearches"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
        {
          name: "listings-product-layout",
          purpose: t("legal.cookies.purpose.listingLayout"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
        {
          name: "diecast_saved_searches",
          purpose: t("legal.cookies.purpose.savedSearches"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
        {
          name: "platform-fee-banner-dismissed",
          purpose: t("legal.cookies.purpose.dismissedBanners"),
          duration: t("legal.cookies.duration.persistentLocal"),
          active: true,
        },
        {
          name: "VISITOR_INFO1_LIVE / YSC",
          purpose: t("legal.cookies.purpose.youtubeEmbed"),
          duration: t("legal.cookies.duration.d179OrSession"),
        },
      ],
    },
    {
      id: "analytics",
      name: t("legal.analyticsCookies"),
      description: t("legal.cookies.analyticsDesc"),
      cookies: [
        {
          name: "_ga / _gid",
          purpose: t("legal.cookies.purpose.googleAnalytics"),
          duration: t("legal.cookies.duration.y2Or24h"),
        },
        {
          name: "_ym_uid / _ym_d",
          purpose: t("legal.cookies.purpose.yandexMetrica"),
          duration: t("legal.cookies.duration.y1"),
        },
      ],
    },
    {
      id: "marketing",
      name: t("legal.marketingCookies"),
      description: t("legal.cookies.marketingDesc"),
      cookies: [
        {
          name: "_fbp",
          purpose: t("legal.cookies.purpose.metaRemarketing"),
          duration: t("legal.cookies.duration.d90"),
        },
        {
          name: "tt_web_id",
          purpose: t("legal.cookies.purpose.tiktokPixel"),
          duration: t("legal.cookies.duration.m13"),
        },
        {
          name: "_gcl_au",
          purpose: t("legal.cookies.purpose.googleAdsConversion"),
          duration: t("legal.cookies.duration.d90"),
          // Etiket kimliği yapılandırılmamış build'lerde (staging/dev) bu çerezi
          // yazabilecek kod gemide yoktur — envanter "Pasif" demeli.
          active: Boolean(GOOGLE_ADS_ID),
        },
        {
          name: "IDE / NID",
          purpose: t("legal.cookies.purpose.googleAdsRetargeting"),
          duration: t("legal.cookies.duration.m1Or13"),
        },
        {
          name: "yandexuid / ymex",
          purpose: t("legal.cookies.purpose.yandexDirect"),
          duration: t("legal.cookies.duration.y1"),
        },
      ],
    },
  ];
}

/** Rıza kalkınca silinecek üçüncü taraf çerezleri (kategoriye göre). */
const PURGEABLE: Record<Exclude<CookieCategory, "necessary">, string[]> = {
  functional: ["VISITOR_INFO1_LIVE", "YSC"],
  analytics: ["_ga", "_gid", "_gat", "_ym_uid", "_ym_d", "_ym_isad"],
  marketing: [
    "_fbp",
    "_fbc",
    "tt_web_id",
    "_ttp",
    "IDE",
    "NID",
    "yandexuid",
    "_gcl_au",
    "_gcl_aw",
    "_gcl_gs",
  ],
};

function setCookie(name: string, value: string, maxAgeDays: number) {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  // Üçüncü taraf çerezleri çoğunlukla `.alanadi.com` üzerine yazılır; host ve
  // nokta-alanadı varyantlarının ikisini de silmezsek çerez ayakta kalır.
  const host = location.hostname;
  const domains = [
    undefined,
    host,
    `.${host}`,
    `.${host.split(".").slice(-2).join(".")}`,
  ];
  for (const domain of domains) {
    document.cookie = `${name}=; path=/; max-age=0${domain ? `; domain=${domain}` : ""}`;
  }
}

export function readPreferences(): CookiePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    return {
      necessary: true,
      functional: parsed.functional === true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      timestamp: parsed.timestamp,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Geçerli bir rıza var mı: verilmiş VE yürürlükteki politika sürümüne. Sürüm
 * kaydı olmayan eski rıza da geçersizdir — bant bir kez daha çıkar ve rıza bu
 * kez sunucuda kayda geçer.
 */
export function hasConsent(): boolean {
  if (typeof window === "undefined") return true;
  return isConsentCurrent(
    localStorage.getItem(CONSENT_KEY),
    localStorage.getItem(CONSENT_VERSION_KEY),
  );
}

export function isConsentCurrent(
  consent: string | null,
  version: string | null,
): boolean {
  return consent === "true" && version === CONSENT_DOCUMENTS.cookies.version;
}

/** Ziyaretçi kimliği: yoksa üretilir ve saklanır. */
export function getOrCreateVisitorId(): string {
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
  localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}

/**
 * Tercihleri kalıcılaştırır: yerel depolama + sunucunun okuyabildiği çerez,
 * Consent Mode güncellemesi ve reddedilen kategorilerin temizliği. KVKK ispat
 * kaydı (sunucudaki onay tablosu) `useCookieConsent`ta yazılır — API çağrısı
 * hook'un işidir, bu modül yalnız tarayıcı durumunu yönetir.
 */
export function saveConsent(input: CookiePreferences): CookiePreferences {
  const prefs: CookiePreferences = {
    ...input,
    necessary: true,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(prefs);

  localStorage.setItem(CONSENT_KEY, "true");
  localStorage.setItem(CONSENT_VERSION_KEY, CONSENT_DOCUMENTS.cookies.version);
  localStorage.setItem(PREFERENCES_KEY, serialized);
  setCookie(CONSENT_KEY, "true", CONSENT_MAX_AGE_DAYS);
  setCookie(PREFERENCES_KEY, serialized, CONSENT_MAX_AGE_DAYS);

  updateGtagConsent(prefs);
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));

  for (const [category, names] of Object.entries(PURGEABLE)) {
    if (prefs[category as CookieCategory]) continue;
    names.forEach(deleteCookie);
  }

  return prefs;
}
