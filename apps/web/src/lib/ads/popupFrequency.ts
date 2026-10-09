/** @format */

/** Popup afişi ziyaretçi başına en fazla bu sıklıkta gösterilir. */
export const POPUP_AD_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const POPUP_AD_STORAGE_KEY = "tarodan.popupAd.shownAt";

/** Depolama kapalı/dolu olabilir (özel pencere): hata "gösterme" demek değildir. */
export function canShowPopupAd(now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(POPUP_AD_STORAGE_KEY);
    if (!raw) return true;
    const shownAt = Number(raw);
    if (!Number.isFinite(shownAt)) return true;
    // Saat geriye alınmışsa (shownAt gelecekte) sonsuza dek kilitlenmesin.
    if (shownAt > now) return true;
    return now - shownAt >= POPUP_AD_INTERVAL_MS;
  } catch {
    return true;
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

export function markPopupAdShown(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(POPUP_AD_STORAGE_KEY, String(now));
  } catch {
    // Yazılamadıysa bu görünüm yine de gösterildi; sonraki sayfada tekrar çıkabilir.
  }
}
