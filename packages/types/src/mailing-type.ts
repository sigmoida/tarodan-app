/**
 * Admin duyuru e-postasının türü — API doğrulayıcısı ile admin formunun tek kaynağı.
 *
 * - `announcement`: hizmet/duyuru; pazarlama iznine bakılmaksızın herkese gider
 *   (eski davranış, varsayılan).
 * - `marketing`: yalnız `acceptsMarketingEmails = true` kullanıcılara gider ve
 *   abonelikten çıkış linki + `List-Unsubscribe` başlığı taşır.
 */
export const MAILING_TYPES = ["announcement", "marketing"] as const;

export type MailingType = (typeof MAILING_TYPES)[number];

export const DEFAULT_MAILING_TYPE: MailingType = "announcement";

/** HTML gövde üst sınırı (karakter) — API DTO'su ve admin şeması aynı değeri kullanır. */
export const BROADCAST_EMAIL_HTML_MAX = 200_000;

/** Konu üst sınırı (karakter). */
export const BROADCAST_EMAIL_SUBJECT_MAX = 240;
