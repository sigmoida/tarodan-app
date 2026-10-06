import { isEmail } from "class-validator";
import {
  MAIL_AREAS,
  MAIL_DELIVERY_MODES,
  MAIL_INTERNAL_EVENTS,
  MAIL_INTERNAL_RECIPIENTS_MAX,
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

/** Olay ayarı olmayan (ya da bozuk) kaydın teslim modu. */
export const DEFAULT_MAIL_EVENT_DELIVERY: MailDeliveryMode = "instant";

export const MAIL_INTERNAL_EVENT_IDS = Object.keys(
  MAIL_INTERNAL_EVENTS,
) as MailInternalEventId[];

/**
 * Ayarı kaydedilmemiş olayın durumu — olay başına varsayılanların TEK yeri.
 * Hepsi kapalıdır; tek istisna misafir iletişim mesajı: o e-posta Mail
 * Yönlendirme'den önce de her zaman gidiyordu. Varsayılanı açık olduğu için
 * alana alıcı eklemek bildirimi kapatmaz, yalnız yönünü değiştirir; admin
 * isterse açıkça kapatır.
 */
const MAIL_EVENT_DEFAULTS: Partial<
  Record<MailInternalEventId, Omit<MailInternalEventState, "id">>
> = {
  "support.guestMessage": { enabled: true, delivery: "instant" },
};

export function defaultMailEventState(
  id: MailInternalEventId,
): MailInternalEventState {
  return {
    id,
    ...(MAIL_EVENT_DEFAULTS[id] ?? {
      enabled: false,
      delivery: DEFAULT_MAIL_EVENT_DELIVERY,
    }),
  };
}

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
  return [...seen].slice(0, MAIL_INTERNAL_RECIPIENTS_MAX);
}

/**
 * `events` JSON kolonu → alanın olaylarının TAM listesi (kayıt sırasıyla).
 * Kayıtta olmayan olay `defaultMailEventState`; bozuk alan (enabled boolean
 * değil, teslim modu bilinmiyor) o alanın varsayılanına düşer; başka alanın
 * olayı yok sayılır.
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
    const fallback = defaultMailEventState(id);
    const entry = stored[id];
    const value =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    return {
      id,
      enabled:
        typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
      delivery: isMailDeliveryMode(value.delivery)
        ? value.delivery
        : fallback.delivery,
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
