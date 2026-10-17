/** @format */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { useActiveAds } from "@/hooks/useActiveAds";
import type { Advertisement } from "@/lib/api/advertisements";
import {
  canShowPopupAd,
  isPopupBlockedByOverlay,
  markPopupAdDismissed,
} from "@/lib/ads/popupFrequency";
import { useOnboardingTourStore } from "@/stores/onboardingTourStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";

/** Sayfa hazır olduktan sonra popup'ın açılmasına kadar bekleme. */
export const POPUP_AD_DELAY_MS = 3000;

/**
 * Popup afişi — yalnız ana sayfada bağlanır (`PopupAd`), her girişte yeniden
 * değerlendirilir. Sıklık reklamın kendisinde (`popupFrequency`): kapatılmış
 * `until_dismissed` reklamlar seçimden ÖNCE elenir (`canShowPopupAd`).
 * Yalnız başka hiçbir katman (zorunlu adım, çerez bandı, tanıtım turu) açık
 * değilken, ~3 sn sonra açılır; bir katman gecikmede açılırsa sayaç iptal
 * olur, kapanınca yeniden başlar. Kapatma kaydı yalnız kapatınca yazılır.
 */
export function usePopupAd(): { ad: Advertisement | null; close: () => void } {
  const outstanding = useRequiredStepsStore((s) => s.outstanding);
  const tourRunning = useOnboardingTourStore((s) => s.running);
  const { needsConsent: cookieBannerOpen } = useCookieConsent();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  const { ads } = useActiveAds("popup", !done);
  // Kapatılmışlar seçimden ÖNCE elenir. API yuva başına en fazla bir afiş
  // döner; localStorage yalnız istemcide okunur (sorgu verisi de öyle).
  const ad = useMemo(() => ads.filter(canShowPopupAd)[0] ?? null, [ads]);

  const blocked = isPopupBlockedByOverlay({
    requiredStepsOutstanding: outstanding,
    cookieBannerOpen,
    tourRunning,
  });

  useEffect(() => {
    if (!ad || done || open || blocked) return;
    const timer = window.setTimeout(() => {
      // Gecikmede başka sekmede kapatılmış olabilir.
      if (!canShowPopupAd(ad)) {
        setDone(true);
        return;
      }
      setOpen(true);
    }, POPUP_AD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ad, done, open, blocked]);

  // X, Esc, arka plan ve afişe tıklayıp gitmek — hepsi kapatmadır.
  const close = useCallback(() => {
    if (ad) markPopupAdDismissed(ad);
    setOpen(false);
    setDone(true);
  }, [ad]);

  return { ad: open ? ad : null, close };
}
