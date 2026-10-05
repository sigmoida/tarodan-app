import { trCalendarParts } from "../../../common/helpers/tr-calendar";

/**
 * Bildirim metnindeki son tarih ("{until}") — Türkiye saatiyle gg.aa.yyyy SS:dd.
 * Sunucu saat diliminden bağımsızdır (`trCalendarParts` açıkça Europe/Istanbul);
 * süre uzatma bildirimleri (teklif/takas extend_once) aynı biçimi kullanır.
 */
export function formatNotificationDeadline(at: Date): string {
  const p = trCalendarParts(at);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
