/**
 * Serbest bildirim linkinin güvenli olup olmadığı.
 *
 * `notification-link.ts`ten AYRI durur: DTO bu kontrolü kullanıyor, o modül ise
 * `NotificationType`ı DTO'dan alıyor. İkisi birbirini import edince döngü
 * oluşuyor ve modül yükleme sırasına göre biri `undefined` kalabiliyordu.
 *
 * Kuralın kendisi `@tarodan/types`tadır: admin formu (yayın hedef linki) aynı
 * izin listesiyle doğrular — iki ayrı liste zamanla ayrışırdı.
 */
import { isSafeNotificationLink } from "@tarodan/types";

/** Yalnız HTTPS ya da İZİN VERİLEN site-içi yol. */
export function isSafeFreeLink(link: string): boolean {
  return isSafeNotificationLink(link);
}
