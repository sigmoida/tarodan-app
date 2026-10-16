/** @format */

import type { Advertisement } from "@/lib/api/advertisements";

/**
 * Popup afişinin "kapatıldı" kaydı — reklam ve SÜRÜM başına:
 * `tarodan.popupAd.dismissed.<id>:<popupVersion>`. Admin reklamı güncelleyince
 * sürüm artar, eski kayıt artık eşleşmez ve popup yeniden açılır.
 *
 * - `until_dismissed`: yalnız KAPATINCA yazılır; kayıt varsa gösterilmez.
 * - `every_visit`: hiçbir şey yazılmaz; ana sayfaya her girişte gösterilir.
 *
 * localStorage kapalı/dolu olabilir (özel pencere): kayıt o zaman sayfa
 * ömrünce bellekte tutulur — aynı oturumda kapatılan popup geri gelmez.
 */
export const POPUP_AD_DISMISS_KEY_PREFIX = "tarodan.popupAd.dismissed.";

type PopupAdIdentity = Pick<
  Advertisement,
  "id" | "popupFrequency" | "popupVersion"
>;

/** localStorage'a yazılamayan kayıtlar (sayfa ömrünce). */
const memoryDismissals = new Set<string>();

export function popupAdDismissKey(
  ad: Pick<Advertisement, "id" | "popupVersion">,
): string {
  return `${POPUP_AD_DISMISS_KEY_PREFIX}${ad.id}:${ad.popupVersion}`;
}

function isDismissed(key: string): boolean {
  if (memoryDismissals.has(key)) return true;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** Bu popup şimdi gösterilebilir mi (kapatma kaydı yoksa ya da her girişteyse). */
export function canShowPopupAd(ad: PopupAdIdentity): boolean {
  if (ad.popupFrequency === "every_visit") return true;
  return !isDismissed(popupAdDismissKey(ad));
}

/**
 * Ziyaretçi popup'ı kapattı. `until_dismissed` için kayıt yazar (depolama
 * yazılamazsa bellekte); `every_visit` için hiçbir şey yazmaz.
 */
export function markPopupAdDismissed(ad: PopupAdIdentity): void {
  if (ad.popupFrequency === "every_visit") return;
  const key = popupAdDismissKey(ad);
  try {
    window.localStorage.setItem(key, String(Date.now()));
  } catch {
    memoryDismissals.add(key);
  }
}

/** Popup'ın önünü kesen başka katmanlar (üst üste binmesin). */
export interface PopupOverlayState {
  /** Zorunlu adım penceresi (onay / yasal kimlik) bekliyor. */
  requiredStepsOutstanding: boolean;
  cookieBannerOpen: boolean;
  tourRunning: boolean;
}

export function isPopupBlockedByOverlay(state: PopupOverlayState): boolean {
  return (
    state.requiredStepsOutstanding ||
    state.cookieBannerOpen ||
    state.tourRunning
  );
}
