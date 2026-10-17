/**
 * Admin duyurusunun türü — API doğrulayıcısı ile admin formunun tek kaynağı.
 * Tür e-postayla sınırlı değildir; push ve uygulama içi (zil) satırını da
 * belirler (Apple 4.5.4, İYS).
 *
 * - `announcement`: işlemsel/hizmet/güvenlik duyurusu; pazarlama iznine ve
 *   bildirim tercihine bakılmaksızın herkese gider (API varsayılanı: eski
 *   çağıranlar böyle davranırdı). Admin formu türü açıkça seçtirir.
 * - `marketing`: yalnız `acceptsMarketingEmails = true` kullanıcılara gider —
 *   push ve zil dahil; push master anahtarına uyar; e-posta abonelikten çıkış
 *   linki + `List-Unsubscribe` başlığı taşır.
 */
export const MAILING_TYPES = ["announcement", "marketing"] as const;

export type MailingType = (typeof MAILING_TYPES)[number];

export const DEFAULT_MAILING_TYPE: MailingType = "announcement";

/** HTML gövde üst sınırı (karakter) — API DTO'su ve admin şeması aynı değeri kullanır. */
export const BROADCAST_EMAIL_HTML_MAX = 200_000;

/** Konu üst sınırı (karakter). */
export const BROADCAST_EMAIL_SUBJECT_MAX = 240;

/**
 * Yönetici yayınının zil (uygulama içi bildirim kutusu) satırı yazıp
 * yazmayacağı — API, zamanlayıcı ve admin listesi için TEK kural:
 *
 * 1. `inApp` verildiyse o kazanır — `channels` içindeki `"in_app"` ile
 *    çelişse bile (admin formu yalnız `inApp` gönderir);
 * 2. verilmediyse true — eski çağıranlar ve `in_app` kolonundan önceki
 *    zamanlanmış satırlar her yayında zil satırı yazıyordu (`"in_app"`
 *    kanalı olsun olmasın). Bu yüzden `channels` yalnız TESLİM kanallarını
 *    (push, email) taşır; `"in_app"` sınırda ayıklanır (`broadcastDeliveryChannels`).
 */
export function resolveBroadcastInApp(input: {
  inApp?: boolean | null;
}): boolean {
  if (typeof input.inApp === "boolean") return input.inApp;
  return true;
}

/** Yayının `channels` listesinden zil işaretini ayıklar; kalanlar teslim kanallarıdır. */
export function broadcastDeliveryChannels(
  channels: readonly string[],
): string[] {
  return channels.filter((c) => c !== "in_app");
}
