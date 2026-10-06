import { isEmail } from "class-validator";
import {
  MAIL_AREAS,
  MAIL_DELIVERY_MODES,
  MAIL_INTERNAL_EVENTS,
  type MailAreaId,
  type MailDeliveryMode,
  type MailInternalEventId,
  type MailInternalEventState,
} from "@tarodan/types";

/**
 * Mail Yönlendirme ayarlarının saf kuralları — okuma (gönderim), yazma (admin
 * servisi) ve ekran durumu AYNI fonksiyonlardan geçer. JSON kolonları
 * (`internal_recipients`, `events`) burada hoşgörülü okunur: elle bozulmuş bir
 * satır gönderimi düşürmez, varsayılana çekilir.
 */

/** Alan başına en çok iç bildirim alıcısı (sözleşme). */
export const MAX_INTERNAL_RECIPIENTS = 20;

/** Görünen ad / alan adı için üst sınır (From başlığı kısa kalsın). */
export const MAX_MAIL_DISPLAY_NAME_LENGTH = 100;

/** Olay ayarı olmayan (ya da bozuk) kaydın varsayılanı: kapalı + anlık. */
export const DEFAULT_MAIL_EVENT_DELIVERY: MailDeliveryMode = "instant";

export const MAIL_INTERNAL_EVENT_IDS = Object.keys(
  MAIL_INTERNAL_EVENTS,
) as MailInternalEventId[];

export function isMailAreaId(value: unknown): value is MailAreaId {
  return (
    typeof value === "string" &&
    (MAIL_AREAS as readonly string[]).includes(value)
  );
}

export function isMailInternalEventId(
  value: unknown,
): value is MailInternalEventId {
  return (
    typeof value === "string" &&
    (MAIL_INTERNAL_EVENT_IDS as readonly string[]).includes(value)
  );
}

export function isMailDeliveryMode(value: unknown): value is MailDeliveryMode {
  return (
    typeof value === "string" &&
    (MAIL_DELIVERY_MODES as readonly string[]).includes(value)
  );
}

/** Olayın alıcı listesini belirleyen alan. */
export function areaOfMailEvent(eventId: MailInternalEventId): MailAreaId {
  return MAIL_INTERNAL_EVENTS[eventId].area;
}

/** Alana bağlı iç olaylar (kayıt sırasıyla). */
export function mailEventsOfArea(area: MailAreaId): MailInternalEventId[] {
  return MAIL_INTERNAL_EVENT_IDS.filter((id) => areaOfMailEvent(id) === area);
}

/** Adres karşılaştırması ve saklama biçimi: kırpılmış, küçük harf. */
export function normalizeMailAddress(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Geçerli tek adres mi. class-validator'ın `isEmail`i — DTO'daki `@IsEmail`
 * ile aynı kural; ayrıca satır sonu içeren hiçbir değer başlığa giremez.
 */
export function isValidMailAddress(value: string): boolean {
  return !/[\r\n]/.test(value) && isEmail(value);
}

/** Görünen ad From başlığına girer: satır sonu ve tırnak kabul edilmez. */
export function isValidMailDisplayName(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_MAIL_DISPLAY_NAME_LENGTH &&
    !/[\r\n"<>\\]/.test(trimmed)
  );
}

/** `"Ad" <adres>` — EmailLog'un `from` kolonu ve admin ekranı için metin. */
export function formatMailFrom(displayName: string, address: string): string {
  return `"${displayName}" <${address}>`;
}

/** `internal_recipients` JSON kolonu → normalize, tekil, geçerli adresler. */
export function parseInternalRecipients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const address = normalizeMailAddress(entry);
    if (isValidMailAddress(address)) seen.add(address);
  }
  return [...seen].slice(0, MAX_INTERNAL_RECIPIENTS);
}

/**
 * `events` JSON kolonu → alanın olaylarının TAM listesi (kayıt sırasıyla).
 * Kayıtta olmayan ya da bozuk olay kapalı + anlık sayılır; başka alanın olayı
 * yok sayılır.
 */
export function parseMailEventStates(
  area: MailAreaId,
  raw: unknown,
): MailInternalEventState[] {
  const stored =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return mailEventsOfArea(area).map((id) => {
    const entry = stored[id];
    const value =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    return {
      id,
      enabled: value.enabled === true,
      delivery: isMailDeliveryMode(value.delivery)
        ? value.delivery
        : DEFAULT_MAIL_EVENT_DELIVERY,
    };
  });
}

/** Olay listesi → `events` JSON kolonunun yazım biçimi. */
export function serializeMailEventStates(
  states: readonly MailInternalEventState[],
): Record<string, { enabled: boolean; delivery: MailDeliveryMode }> {
  return Object.fromEntries(
    states.map((state) => [
      state.id,
      { enabled: state.enabled, delivery: state.delivery },
    ]),
  );
}
