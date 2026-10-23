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
import { useBoostDialogStore } from "@/stores/boostDialogStore";
import { useOnboardingTourStore } from "@/stores/onboardingTourStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";

/** Sayfa hazır olduktan sonra popup'ın açılmasına kadar bekleme. */
export const POPUP_AD_DELAY_MS = 3000;

/**
 * The popup ad: mounted on the home page only (`PopupAd`) and evaluated on
 * every visit. The frequency lives on the ad itself (`popupFrequency`):
 * dismissed `until_dismissed` ads are dropped BEFORE the pick
 * (`canShowPopupAd`). It opens ~3 s later, and only while no other layer is
 * on screen (a required step, the cookie banner, the onboarding tour, the
 * boost offer or a boost dialog); a layer that opens during the delay
 * cancels the timer, which restarts once it closes. The dismissal is
 * recorded only on close.
 */
export function usePopupAd(): { ad: Advertisement | null; close: () => void } {
  const outstanding = useRequiredStepsStore((s) => s.outstanding);
  const tourRunning = useOnboardingTourStore((s) => s.running);
  const boostOpen = useBoostDialogStore(
    (s) => s.offerOpen || s.openDialogs > 0,
  );
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
    boostOpen,
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
