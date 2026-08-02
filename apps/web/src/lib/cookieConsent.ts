/**
 * Çerez rızası — tek kaynak.
 *
 * Hem alt taraftaki onay banner'ı hem de /cookies sayfasındaki tercih paneli
 * buradaki kategori tanımlarını, envanteri ve kalıcılık mantığını kullanır.
 * Daha önce ikisi ayrı tipler (`necessary/analytics/marketing` vs
 * `functional/analytics/marketing`) ve ayrı kayıt yolları kullandığı için
 * panelden yapılan kayıt banner'ın tercihini bozuyordu.
 */

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
 */
export const COOKIE_CATEGORIES: CookieCategoryInfo[] = [
  {
    id: "necessary",
    name: "Zorunlu Çerezler",
    description:
      "Oturum, güvenlik ve temel platform işlevleri için gereklidir. Kapatılamaz.",
    required: true,
    cookies: [
      {
        name: "web_at / web_rt",
        purpose: "Oturum kimlik doğrulaması (httpOnly)",
        duration: "15 dakika / 7 gün",
        active: true,
      },
      {
        name: "access_token / refresh_token",
        purpose: "API oturumu (httpOnly)",
        duration: "15 dakika / 7 gün",
        active: true,
      },
      {
        name: "csrf_token",
        purpose: "Siteler arası istek sahteciliği (CSRF) koruması",
        duration: "7 gün",
        active: true,
      },
      {
        name: "tarodan_authed",
        purpose: "Oturumun açık olduğunu arayüze bildiren gösterge",
        duration: "7 gün",
        active: true,
      },
      {
        name: "cookie_consent / cookie_preferences",
        purpose: "Çerez onayınızın ve tercihlerinizin saklanması (yasal ispat)",
        duration: "1 yıl",
        active: true,
      },
      {
        name: "site_unlock",
        purpose: "Bakım/erişim kilidi doğrulaması",
        duration: "10 gün",
        active: true,
      },
      {
        name: "auth-storage / tarodan_user_snapshot",
        purpose:
          "Oturum açık kullanıcının profil bilgisinin arayüzde tutulması",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
    ],
  },
  {
    id: "functional",
    name: "İşlevsel Çerezler",
    description:
      "Dil, sepet ve görünüm tercihlerinizi hatırlar. Kapatırsanız bu tercihler her ziyarette sıfırlanır.",
    cookies: [
      {
        name: "NEXT_LOCALE",
        purpose: "Dil tercihi",
        duration: "1 yıl",
        active: true,
      },
      {
        name: "cart-storage",
        purpose: "Misafir sepeti içeriği",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
      {
        name: "recent-searches",
        purpose: "Son aramalarınız ve filtreleriniz",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
      {
        name: "listings-product-layout",
        purpose: "Ürün listesi görünüm tercihi",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
      {
        name: "diecast_saved_searches",
        purpose: "Kaydettiğiniz aramalar",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
      {
        name: "platform-fee-banner-dismissed",
        purpose: "Kapattığınız duyuruların tekrar gösterilmemesi",
        duration: "Kalıcı (yerel depolama)",
        active: true,
      },
      {
        name: "VISITOR_INFO1_LIVE / YSC",
        purpose: "İlan sayfalarına gömülü YouTube videolarının oynatımı",
        duration: "179 gün / Oturum",
      },
    ],
  },
  {
    id: "analytics",
    name: "Analitik Çerezler",
    description:
      "Platformun nasıl kullanıldığını anlamamıza ve iyileştirmemize yardımcı olur. Kimliğinizi tespit etmek için kullanılmaz.",
    cookies: [
      {
        name: "_ga / _gid",
        purpose: "Google Analytics — ziyaretçi ve oturum ayrımı",
        duration: "2 yıl / 24 saat",
      },
      {
        name: "_ym_uid / _ym_d",
        purpose: "Yandex.Metrica — trafik ve ısı haritası analizi",
        duration: "1 yıl",
      },
    ],
  },
  {
    id: "marketing",
    name: "Pazarlama Çerezleri",
    description:
      "İlgi alanlarınıza uygun reklam gösterebilmek için reklam ortaklarıyla paylaşılır.",
    cookies: [
      {
        name: "_fbp",
        purpose: "Meta (Facebook/Instagram) yeniden pazarlama",
        duration: "90 gün",
      },
      {
        name: "tt_web_id",
        purpose: "TikTok Pixel — dönüşüm ölçümü",
        duration: "13 ay",
      },
      {
        name: "IDE / NID",
        purpose: "Google Ads & YouTube yeniden hedefleme",
        duration: "1 ay / 13 ay",
      },
      {
        name: "yandexuid / ymex",
        purpose: "Yandex Direct reklam gösterimi",
        duration: "1 yıl",
      },
    ],
  },
];

/** Rıza kalkınca silinecek üçüncü taraf çerezleri (kategoriye göre). */
const PURGEABLE: Record<Exclude<CookieCategory, "necessary">, string[]> = {
  functional: ["VISITOR_INFO1_LIVE", "YSC"],
  analytics: ["_ga", "_gid", "_gat", "_ym_uid", "_ym_d", "_ym_isad"],
  marketing: ["_fbp", "_fbc", "tt_web_id", "_ttp", "IDE", "NID", "yandexuid"],
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

export function hasConsent(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(CONSENT_KEY) === "true";
}

/** Rıza durumuna göre Google Consent Mode sinyallerini günceller. */
function syncConsentMode(prefs: CookiePreferences) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
    .gtag;
  if (typeof gtag !== "function") return;
  gtag("consent", "update", {
    security_storage: "granted",
    functionality_storage: prefs.functional ? "granted" : "denied",
    personalization_storage: prefs.functional ? "granted" : "denied",
    analytics_storage: prefs.analytics ? "granted" : "denied",
    ad_storage: prefs.marketing ? "granted" : "denied",
    ad_user_data: prefs.marketing ? "granted" : "denied",
    ad_personalization: prefs.marketing ? "granted" : "denied",
  });
}

/**
 * Tercihleri kalıcılaştırır: yerel depolama + sunucunun okuyabildiği çerez,
 * Consent Mode güncellemesi, reddedilen kategorilerin temizliği ve KVKK ispat
 * kaydı için sunucuya log.
 */
export function saveConsent(input: CookiePreferences): CookiePreferences {
  const prefs: CookiePreferences = {
    ...input,
    necessary: true,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(prefs);

  localStorage.setItem(CONSENT_KEY, "true");
  localStorage.setItem(PREFERENCES_KEY, serialized);
  setCookie(CONSENT_KEY, "true", CONSENT_MAX_AGE_DAYS);
  setCookie(PREFERENCES_KEY, serialized, CONSENT_MAX_AGE_DAYS);

  syncConsentMode(prefs);

  for (const [category, names] of Object.entries(PURGEABLE)) {
    if (prefs[category as CookieCategory]) continue;
    names.forEach(deleteCookie);
  }

  void fetch("/api/consent-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "cookie_consent",
      preferences: prefs,
      userAgent: navigator.userAgent,
    }),
  }).catch(() => {
    // İstemci tarafındaki rıza yine de geçerli; log en iyi çaba.
  });

  return prefs;
}
