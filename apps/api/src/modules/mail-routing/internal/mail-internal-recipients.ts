import type {
  MailAreaId,
  MailDeliveryMode,
  MailInternalEventId,
} from "@tarodan/types";
import { supportNotificationEmail } from "../../../config/mail";
import {
  normalizeMailAddress,
  isValidMailAddress,
} from "../../mail/helpers/mail-area-settings";
import type { MailAreaRouting } from "../../mail/mail-routing-directory";

/** Bir iç olayın gönderim kararı: kime, hangi modla. */
export interface InternalNoticeRoute {
  recipients: string[];
  delivery: MailDeliveryMode;
}

/**
 * Eski davranışın geri düşüşü: misafir mesajı, Mail Yönlendirme'den ÖNCE
 * `SUPPORT_NOTIFICATION_EMAIL`e her zaman ve anında gidiyordu. "guestMessage"
 * alanına alıcı girilmediği sürece bu aynen sürer (olay anahtarından bağımsız);
 * alıcı girildiği anda alanın açık/kapalı ve teslim ayarı geçerli olur.
 */
function isLegacyGuestFallback(
  eventId: MailInternalEventId,
  routing: MailAreaRouting,
): boolean {
  return (
    eventId === "support.guestMessage" &&
    routing.internalRecipients.length === 0
  );
}

/** Alanın özet alıcıları (özet işinin, olaydan bağımsız kararı). */
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
  if (isLegacyGuestFallback(eventId, routing)) {
    const recipients = areaRecipients("guestMessage", routing);
    return recipients.length > 0 ? { recipients, delivery: "instant" } : null;
  }
  const state = routing.events.find((event) => event.id === eventId);
  if (!state?.enabled) return null;
  if (routing.internalRecipients.length === 0) return null;
  return { recipients: routing.internalRecipients, delivery: state.delivery };
}
