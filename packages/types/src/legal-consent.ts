/**
 * Legal consent records: the ONE source of the document keys and their
 * CURRENT versions. The API (version stamp, re-consent rule), web (checkboxes,
 * cookie banner) and admin (Consent records screen) read this file.
 *
 * A version is the date the text changed (YYYY-MM-DD), optionally followed by
 * `-draft` (`DRAFT_CONSENT_VERSION_SUFFIX`) while the text waits for legal
 * sign-off. When a document's text changes, its version here must change too:
 * for a document required for every account, every member is asked to accept
 * again at the next sign-in; without the change the new text looks accepted
 * under the old version.
 */

import { isPlatformSettingOn } from "./platform-setting";

export const CONSENT_DOCUMENT_KEYS = [
  "terms",
  "privacy",
  "kvkk",
  "distance_sales",
  "cookies",
  "marketing",
  "platform_service_sales",
  "withdrawal_waiver",
] as const;

export type ConsentDocumentKey = (typeof CONSENT_DOCUMENT_KEYS)[number];

export interface ConsentDocumentDefinition {
  /** The version of the current text (`YYYY-MM-DD`, or with `-draft`). */
  version: string;
  /**
   * Whether opening (and keeping) an account needs it. A member without a
   * record of a required document, or with an old version, is asked again.
   */
  requiredForAccount: boolean;
  /** The storefront path of the text; null for a document without a page. */
  path: string | null;
}

/**
 * Suffix of a version whose text is a draft that legal has not signed off.
 * A consent recorded against it carries the suffix in its own row
 * (`consent_records.version`), so the evidence never passes a draft off as
 * the signed text. Before the release that relies on the document, replace
 * the text and set the date of the signed text without the suffix. A
 * document required for every account is never a draft (contract spec).
 */
export const DRAFT_CONSENT_VERSION_SUFFIX = "-draft";

/** Whether a recorded or current version is a draft (`-draft`). */
export function isDraftConsentVersion(version: string): boolean {
  return version.endsWith(DRAFT_CONSENT_VERSION_SUFFIX);
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
  // There is no SEPARATE KVKK page yet: the /privacy page carries the title
  // "KVKK Aydınlatma Metni", so the link goes there. When the customer gives a
  // separate text, the path and version change here (docs/CONSENTS.md, "Open
  // points").
  kvkk: { version: "2026-08-04", requiredForAccount: true, path: "/privacy" },
  // Distance sales consent is per ORDER, not per account; taken at checkout
  // or at the payment step.
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
  // Commercial electronic message consent: no text of its own, the checkbox
  // is the statement.
  marketing: { version: "2026-10-05", requiredForAccount: false, path: null },
  // Platform services (listing boost today, membership later): the
  // pre-contract information form and the distance service contract,
  // accepted per ORDER in the purchase dialog and recorded with the order
  // (`PlatformServiceConsentService`). DRAFT: legal has not signed the text
  // off (tarodan-ops plan 2026-10-21-listing-boost, D15, D17); the release
  // that sells boost waits for the signed text and its dated version.
  platform_service_sales: {
    version: "2026-10-21-draft",
    requiredForAccount: false,
    path: "/platform-service-sales",
  },
  // The statement that the service starts at once with the buyer's approval
  // and the right of withdrawal therefore does not apply. No page of its own:
  // the statement is the checkbox text. DRAFT, like platform_service_sales.
  withdrawal_waiver: {
    version: "2026-10-21-draft",
    requiredForAccount: false,
    path: null,
  },
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
  "social_link_reset",
  "legacy_backfill",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Onayın sahibi türü — admin filtresi. Üye (`userId`), misafir alıcı
 * (`guestEmail`) ya da giriş yapmamış ziyaretçi (yalnız `visitorId`).
 */
export const CONSENT_SUBJECT_TYPES = ["user", "guest", "visitor"] as const;
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

// ── Catalog keys (admin screen, web consent gate, Excel export) ─────────────
// A document's name is the title key of its legal page (one text, one name);
// a document without a page has its own title key. Source, action and
// subject type labels belong to admin only.

export const CONSENT_DOCUMENT_I18N_KEYS = {
  terms: "legal.termsTitle",
  privacy: "legal.privacyTitle",
  kvkk: "legal.kvkkTitle",
  distance_sales: "legal.distanceSalesTitle",
  cookies: "legal.cookiesTitle",
  marketing: "legal.marketingConsentTitle",
  platform_service_sales: "legal.platformServiceSales.title",
  withdrawal_waiver: "legal.withdrawalWaiverTitle",
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
  social_link_reset: "admin.consents.sources.socialLinkReset",
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
 * The platform setting that makes the distance sales consent REQUIRED at the
 * payment step. Off by default, so older mobile builds that do not send the
 * checkbox can still pay. An on/off setting (`isPlatformSettingOn`).
 */
export const DISTANCE_SALES_CONSENT_REQUIRED_SETTING =
  "distance_sales_consent_required";

export function parseDistanceSalesConsentRequired(
  value: string | null | undefined,
): boolean {
  return isPlatformSettingOn(value);
}

/**
 * Web gateway'inin (BFF) tarayıcının IP'sini API'ye taşıdığı başlık. Gateway
 * isteği sunucudan attığı için API'nin gördüğü bağlantı web sunucusunundur;
 * onay kaydının "nereden" sorusu bu başlıkla cevaplanır. API başlığa yalnız
 * özel ağdan (gateway) gelen istekte güvenir.
 */
export const GATEWAY_CLIENT_IP_HEADER = "x-tarodan-client-ip";
