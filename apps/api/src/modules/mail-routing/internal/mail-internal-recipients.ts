import type {
  MailAreaId,
  MailDeliveryMode,
  MailInternalEventId,
} from "@tarodan/types";
import { supportNotificationEmail } from "../../../config/mail";
import {
  areaOfMailEvent,
  defaultMailEventState,
  isValidMailAddress,
  normalizeMailAddress,
} from "../../mail/helpers/mail-area-settings";
import type { MailAreaRouting } from "../../mail/mail-routing-directory";

/** Bir iç olayın gönderim kararı: kime, hangi modla. */
export interface InternalNoticeRoute {
  recipients: string[];
  delivery: MailDeliveryMode;
}

/**
 * Alanın iç bildirim alıcıları. Tek geri düşüş misafir mesajı alanıdır: Mail
 * Yönlendirme'den önce misafir iletişim mesajı `SUPPORT_NOTIFICATION_EMAIL`e
 * gidiyordu; alana alıcı girilmediği sürece oraya gitmeye devam eder (olayın
 * varsayılanı açık, bkz. `defaultMailEventState`). Alıcı girildiği anda e-posta
 * onlara yönelir.
 */
export function areaRecipients(
  area: MailAreaId,
  routing: MailAreaRouting,
): string[] {
  if (routing.internalRecipients.length > 0) return routing.internalRecipients;
  if (area !== "guestMessage") return [];
  const fallback = normalizeMailAddress(supportNotificationEmail());
  return isValidMailAddress(fallback) ? [fallback] : [];
}

/**
 * Olay gönderilecek mi, kime, nasıl? `null` = sessizce bırak (olay kapalı ya
 * da alanın alıcısı yok). Notifier (ön eleme) ve handler (kesin karar) AYNI
 * kuralı çağırır.
 */
export function internalNoticeRoute(
  eventId: MailInternalEventId,
  routing: MailAreaRouting,
): InternalNoticeRoute | null {
  const state =
    routing.events.find((event) => event.id === eventId) ??
    defaultMailEventState(eventId);
  if (!state.enabled) return null;
  const recipients = areaRecipients(areaOfMailEvent(eventId), routing);
  if (recipients.length === 0) return null;
  return { recipients, delivery: state.delivery };
}
