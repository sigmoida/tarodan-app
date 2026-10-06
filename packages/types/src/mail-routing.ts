/**
 * MAIL ROUTING — hangi e-posta hangi kutudan çıkar, hangi operasyon olayı
 * hangi personele gider.
 *
 * Alan (area) = e-postanın iş konusu. Müşteriye giden her şablon tam bir alana
 * bağlıdır (eşleme API'de `email-template-registry`), her alana admin bir
 * gönderici hesap (posta kutusu) atar. Hesabı olmayan ya da hesabı çalışmayan
 * alan, varsayılan kimlikten (env `MAIL_FROM` + `SMTP_*`) gönderir.
 *
 * İç bildirimler: aşağıdaki operasyon olayları, olayın alanındaki
 * `internalRecipients` listesine anında ya da saatlik/günlük özet olarak gider.
 *
 * API (çözüm + doğrulama) ve admin (ekran) AYNI tanımı okur. Ayrıntı:
 * docs/MAIL_ROUTING.md.
 */

export const MAIL_AREAS = [
  "account",
  "order",
  "cancellation",
  "refund",
  "trade",
  "offer",
  "payment",
  "invoice",
  "membership",
  "listing",
  "discount",
  "boost",
  "ad",
  "support",
  "guestMessage",
  "report",
  "sellerApplication",
  "marketing",
  "social",
] as const;
export type MailAreaId = (typeof MAIL_AREAS)[number];

export const MAIL_DELIVERY_MODES = ["instant", "hourly", "daily"] as const;
export type MailDeliveryMode = (typeof MAIL_DELIVERY_MODES)[number];

/** Operational events that can be mailed to staff. `area` decides the recipient list. */
export const MAIL_INTERNAL_EVENTS = {
  "order.paid": { area: "order" },
  "order.cancelled": { area: "cancellation" },
  "refund.requested": { area: "refund" },
  "trade.started": { area: "trade" },
  "trade.disputed": { area: "trade" },
  "offer.converted": { area: "offer" },
  "support.ticketOpened": { area: "support" },
  "support.guestMessage": { area: "guestMessage" },
  "report.productReported": { area: "report" },
  "listing.pendingApproval": { area: "listing" },
  "discount.createdBySeller": { area: "discount" },
  "boost.purchased": { area: "boost" },
} as const satisfies Record<string, { area: MailAreaId }>;
export type MailInternalEventId = keyof typeof MAIL_INTERNAL_EVENTS;

export interface MailSenderAccountView {
  id: string;
  address: string; // mailbox, e.g. siparis@tarodan.com.tr (unique, lower-cased)
  displayName: string; // "Tarodan Sipariş"
  host: string | null; // null = use the default SMTP host/port/secure from env
  port: number | null;
  secure: boolean | null;
  username: string; // SMTP login; defaults to the address
  hasPassword: boolean; // the password itself is NEVER returned
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  usedByAreas: MailAreaId[];
}

export interface MailInternalEventState {
  id: MailInternalEventId;
  enabled: boolean;
  delivery: MailDeliveryMode;
}

export interface MailAreaState {
  id: MailAreaId;
  /** Customer-facing template keys that belong to this area (read-only, from the registry). */
  templateKeys: string[];
  senderAccountId: string | null;
  /** Overrides the account's display name for this area; null = account's own. */
  displayName: string | null;
  /** Reply-To for this area's customer mail; null = the sender address. */
  replyTo: string | null;
  /** Staff recipients of this area's internal notifications. */
  internalRecipients: string[];
  events: MailInternalEventState[];
}

export interface MailRoutingState {
  defaultFrom: string; // resolved env identity, for display
  accounts: MailSenderAccountView[];
  areas: MailAreaState[]; // one per MAIL_AREAS entry, in that order
}

export interface MailSenderAccountInput {
  address: string;
  displayName: string;
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  username?: string | null;
  /** Required on create; omit on update to keep the stored one. */
  password?: string;
}

export interface MailAreaUpdate {
  senderAccountId?: string | null;
  displayName?: string | null;
  replyTo?: string | null;
  internalRecipients?: string[];
  events?: Array<{
    id: MailInternalEventId;
    enabled: boolean;
    delivery: MailDeliveryMode;
  }>;
}

export interface MailAccountTestResult {
  ok: boolean;
  error: string | null;
}

// ── Kurallar — API (doğrulama) ve admin (form) AYNI tanımı kullanır ────────

/** Görünen adın (alan ezmesi ya da hesabın adı) en çok uzunluğu, kırpılmış. */
export const MAIL_DISPLAY_NAME_MAX_LENGTH = 100;

/** Bir alanın en çok iç bildirim alıcısı (tekilleştirme sonrası). */
export const MAIL_INTERNAL_RECIPIENTS_MAX = 20;

/**
 * Display name goes into the From header: non-empty after trim, at most
 * MAIL_DISPLAY_NAME_MAX_LENGTH (after trim), and none of: CR, LF, double
 * quote, `<`, `>`, backslash. Turkish letters and other punctuation are fine.
 */
export function isValidMailDisplayName(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAIL_DISPLAY_NAME_MAX_LENGTH &&
    !/[\r\n"<>\\]/.test(trimmed)
  );
}
