/**
 * Hukuki onay kayıtları — belge anahtarları ve YÜRÜRLÜKTEKİ sürümler için TEK
 * kaynak. API (kayıt damgası, yeniden-onay hesabı), web (onay kutuları, çerez
 * bandı) ve admin (Onay Kayıtları ekranı) bu dosyayı okur.
 *
 * Sürüm, metnin değiştiği günün tarihidir (YYYY-MM-DD). Bir belgenin metni
 * değiştiğinde BURADAKİ sürüm de güncellenmelidir: hesap için zorunlu bir
 * belgede sürüm değişince her üye bir sonraki girişinde yeniden onaya
 * çağrılır; güncellenmezse yeni metin eski sürüm numarasıyla kabul edilmiş
 * görünür.
 */

export const CONSENT_DOCUMENT_KEYS = [
  "terms",
  "privacy",
  "kvkk",
  "distance_sales",
  "cookies",
  "marketing",
] as const;

export type ConsentDocumentKey = (typeof CONSENT_DOCUMENT_KEYS)[number];

export interface ConsentDocumentDefinition {
  /** Yürürlükteki metnin sürümü. */
  version: string;
  /**
   * Hesap açmak (ve kullanmaya devam etmek) için zorunlu mu. Zorunlu belgenin
   * kaydı yoksa ya da eski sürümdeyse üye yeniden onaya çağrılır.
   */
  requiredForAccount: boolean;
  /** Metnin yayımlandığı storefront yolu; metni olmayan belgede null. */
  path: string | null;
}

export const CONSENT_DOCUMENTS: Record<
  ConsentDocumentKey,
  ConsentDocumentDefinition
> = {
  terms: { version: "2026-08-05", requiredForAccount: true, path: "/terms" },
  privacy: {
    version: "2026-08-04",
    requiredForAccount: true,
    path: "/privacy",
  },
  // AYRI bir KVKK sayfası henüz yok: /privacy sayfası "KVKK Aydınlatma Metni"
  // başlığını taşıyor, bağlantı oraya gider. Müşteri ayrı bir metin verdiğinde
  // yol ve sürüm burada güncellenir (bkz. docs/CONSENTS.md "Açık konular").
  kvkk: { version: "2026-08-04", requiredForAccount: true, path: "/privacy" },
  // Mesafeli satış onayı hesap değil SİPARİŞ başınadır; ödeme adımında alınır.
  distance_sales: {
    version: "2026-08-03",
    requiredForAccount: false,
    path: "/distance-sales",
  },
  cookies: {
    version: "2026-08-02",
    requiredForAccount: false,
    path: "/cookies",
  },
  // Ticari elektronik ileti izni: ayrı bir metni yok, onay kutusunun kendisi.
  marketing: { version: "2026-10-05", requiredForAccount: false, path: null },
};

/** Hesap için zorunlu belgeler — kayıt formu ve yeniden-onay kapısı bunları ister. */
export const ACCOUNT_REQUIRED_CONSENTS: readonly ConsentDocumentKey[] =
  CONSENT_DOCUMENT_KEYS.filter(
    (key) => CONSENT_DOCUMENTS[key].requiredForAccount,
  );

export function isConsentDocumentKey(
  value: unknown,
): value is ConsentDocumentKey {
  return (
    typeof value === "string" &&
    (CONSENT_DOCUMENT_KEYS as readonly string[]).includes(value)
  );
}

/** Onayın yönü: verildi ya da geri çekildi (pazarlama, çerez kategorileri). */
export const CONSENT_ACTIONS = ["granted", "withdrawn"] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/**
 * Onayın alındığı yer. Prisma `ConsentSource` enum'u ile birebir aynıdır —
 * API'deki sözleşme testi (consent-catalog.contract.spec) ayrışmayı yakalar.
 */
export const CONSENT_SOURCES = [
  "registration",
  "consent_prompt",
  "checkout",
  "payment",
  "cookie_banner",
  "account_settings",
  "newsletter_unsubscribe",
  "account_deletion",
  "legacy_backfill",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Onayın sahibi türü — admin filtresi. Üye (`userId`), misafir alıcı
 * (`guestEmail`) ya da giriş yapmamış ziyaretçi (yalnız `visitorId`).
 */
export const CONSENT_SUBJECT_TYPES = ["user", "guest", "visitor"] as const;
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

// ── Katalog anahtarları (admin ekranı, web onay kapısı, Excel dökümü) ────────
// Belge adları, yasal sayfaların mevcut başlık anahtarlarıdır (aynı metin iki
// ad altında yaşamasın); kaynak / aksiyon / sahip türü yalnız admin'e aittir.

export const CONSENT_DOCUMENT_I18N_KEYS = {
  terms: "legal.termsTitle",
  privacy: "legal.privacyTitle",
  kvkk: "legal.kvkkTitle",
  distance_sales: "legal.distanceSalesTitle",
  cookies: "legal.cookiesTitle",
  marketing: "legal.marketingConsentTitle",
} as const satisfies Record<ConsentDocumentKey, string>;

export const CONSENT_ACTION_I18N_KEYS = {
  granted: "admin.consents.actions.granted",
  withdrawn: "admin.consents.actions.withdrawn",
} as const satisfies Record<ConsentAction, string>;

export const CONSENT_SOURCE_I18N_KEYS = {
  registration: "admin.consents.sources.registration",
  consent_prompt: "admin.consents.sources.consentPrompt",
  checkout: "admin.consents.sources.checkout",
  payment: "admin.consents.sources.payment",
  cookie_banner: "admin.consents.sources.cookieBanner",
  account_settings: "admin.consents.sources.accountSettings",
  newsletter_unsubscribe: "admin.consents.sources.newsletterUnsubscribe",
  account_deletion: "admin.consents.sources.accountDeletion",
  legacy_backfill: "admin.consents.sources.legacyBackfill",
} as const satisfies Record<ConsentSource, string>;

export const CONSENT_SUBJECT_TYPE_I18N_KEYS = {
  user: "admin.consents.subjects.user",
  guest: "admin.consents.subjects.guest",
  visitor: "admin.consents.subjects.visitor",
} as const satisfies Record<ConsentSubjectType, string>;

/** Bir kaydın sahibi türü — admin listesi ve Excel dökümü aynı kuralla okur. */
export function consentSubjectType(row: {
  userId: string | null;
  guestEmail: string | null;
}): ConsentSubjectType {
  if (row.userId) return "user";
  return row.guestEmail ? "guest" : "visitor";
}

/** `GET /admin/consents` satırı. */
export interface AdminConsentRecordRow {
  id: string;
  document: ConsentDocumentKey;
  version: string;
  /** Kaydın sürümü yürürlükteki sürümle aynı mı. */
  isCurrentVersion: boolean;
  action: ConsentAction;
  source: ConsentSource;
  subjectType: ConsentSubjectType;
  user: {
    id: string;
    displayName: string;
    email: string;
    adminCode: string;
  } | null;
  guestEmail: string | null;
  visitorId: string | null;
  /** Çerez kategorileri vb. */
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  checkoutGroup: { id: string; groupNumber: string } | null;
  order: { id: string; orderNumber: string } | null;
  createdAt: string;
}

/** Yeniden-onay sebebi: hiç kaydı yok mu, yoksa eski sürümü mü onaylamış. */
export type PendingConsentReason = "missing" | "outdated";

export interface PendingConsent {
  document: ConsentDocumentKey;
  /** Onaylanması istenen (yürürlükteki) sürüm. */
  version: string;
  reason: PendingConsentReason;
  path: string | null;
}

/** `GET /consents/me/pending` yanıtı. Boş liste = kapı açık. */
export interface PendingConsentsResponse {
  pending: PendingConsent[];
}

/** Admin kullanıcı detayı: bir belgenin üyedeki güncel durumu. */
export interface ConsentDocumentStatus {
  document: ConsentDocumentKey;
  currentVersion: string;
  requiredForAccount: boolean;
  /** Zorunlu belge ve üye bir sonraki girişte yeniden onaya çağrılacak. */
  pending: boolean;
  /** Belgenin en son kaydı; hiç kaydı yoksa null. */
  latest: {
    version: string;
    action: ConsentAction;
    source: ConsentSource;
    createdAt: string;
  } | null;
}

/** Çerez bandındaki isteğe bağlı kategoriler (zorunlu kategori her zaman açık). */
export const OPTIONAL_COOKIE_CATEGORIES = [
  "functional",
  "analytics",
  "marketing",
] as const;
export type OptionalCookieCategory =
  (typeof OPTIONAL_COOKIE_CATEGORIES)[number];

/**
 * Mesafeli satış onayını ödeme adımında ZORUNLU kılan platform ayarı.
 * Varsayılan kapalı: onay kutusunu göndermeyen eski mobil sürümler ödeme
 * yapabilmeye devam eder. Yalnız "true" açık sayılır.
 */
export const DISTANCE_SALES_CONSENT_REQUIRED_SETTING =
  "distance_sales_consent_required";

export function parseDistanceSalesConsentRequired(
  value: string | null | undefined,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Web gateway'inin (BFF) tarayıcının IP'sini API'ye taşıdığı başlık. Gateway
 * isteği sunucudan attığı için API'nin gördüğü bağlantı web sunucusunundur;
 * onay kaydının "nereden" sorusu bu başlıkla cevaplanır. API başlığa yalnız
 * özel ağdan (gateway) gelen istekte güvenir.
 */
export const GATEWAY_CLIENT_IP_HEADER = "x-tarodan-client-ip";
