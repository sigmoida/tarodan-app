/** @format */

/**
 * Sayaç (impression/click) gönderimi: sayfadan ayrılırken de (dış bağlantı
 * tıklaması) kesilmez. `sendBeacon` yoksa/reddederse `keepalive` fetch'e düşer.
 * Hata yutulur — ölçüm, ziyaretçi akışını asla bozmamalı. Afiş ve hero sayaçları
 * bu tek yardımcıyı paylaşır.
 */
export function sendTrackingBeacon(url: string): void {
  if (typeof window === "undefined") return;
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(url)
    ) {
      return;
    }
  } catch {
    // beacon kullanılamadı → fetch yedeği
  }
  void fetch(url, {
    method: "POST",
    keepalive: true,
    credentials: "include",
  }).catch(() => undefined);
}
