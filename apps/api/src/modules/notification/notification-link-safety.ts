/**
 * Serbest bildirim linkinin güvenli olup olmadığı.
 *
 * `notification-link.ts`ten AYRI durur: DTO bu kontrolü kullanıyor, o modül ise
 * `NotificationType`ı DTO'dan alıyor. İkisi birbirini import edince döngü
 * oluşuyor ve modül yükleme sırasına göre biri `undefined` kalabiliyordu.
 */

/** Yalnız HTTPS ya da site-içi mutlak yol kabul edilir. */
export function isSafeFreeLink(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed || trimmed.includes("{{")) return false;
  // `//host` protokol-göreli adrestir; iç link sanılıp açılmamalı.
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}
