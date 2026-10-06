/**
 * Mail adresleri — tek okuma noktası.
 *
 * `SUPPORT_NOTIFICATION_EMAIL`: misafir iletişim formu bildiriminin ESKİ
 * alıcısı. Mail Yönlendirme'de "guestMessage" alanının alıcı listesi boşken
 * geri düşüş olarak kalır (docs/MAIL_ROUTING.md); liste dolunca okunmaz.
 */
export const DEFAULT_SUPPORT_NOTIFICATION_EMAIL = "destek@tarodan.com.tr";

export function supportNotificationEmail(): string {
  return (
    process.env.SUPPORT_NOTIFICATION_EMAIL?.trim() ||
    DEFAULT_SUPPORT_NOTIFICATION_EMAIL
  );
}
