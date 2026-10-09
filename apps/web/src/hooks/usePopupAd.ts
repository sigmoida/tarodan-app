/** @format */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { useActiveAds } from "@/hooks/useActiveAds";
import type { Advertisement } from "@/lib/api/advertisements";
import { pickAd } from "@/lib/ads/pickAd";
import {
  canShowPopupAd,
  isPopupBlockedByOverlay,
  markPopupAdShown,
} from "@/lib/ads/popupFrequency";
import { useOnboardingTourStore } from "@/stores/onboardingTourStore";
import { useRequiredStepsStore } from "@/stores/requiredStepsStore";

/** Sayfa hazır olduktan sonra popup'ın açılmasına kadar bekleme. */
export const POPUP_AD_DELAY_MS = 3000;

/**
 * Popup afişi: ziyaretçi başına 24 saatte en çok bir kez, yalnız başka hiçbir
 * katman (zorunlu adım, çerez bandı, tanıtım turu) açık değilken, ~3 sn sonra.
 * Bir katman gecikme süresinde açılırsa sayaç iptal olur; kapanınca yeniden
 * başlar. Gösterim anında damga atılır — kapatılmasa da sayfa yenilemede
 * tekrar çıkmaz.
 */
export function usePopupAd(): { ad: Advertisement | null; close: () => void } {
  const outstanding = useRequiredStepsStore((s) => s.outstanding);
  const tourRunning = useOnboardingTourStore((s) => s.running);
  const { needsConsent: cookieBannerOpen } = useCookieConsent();
  const [capAllows, setCapAllows] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  // localStorage yalnız istemcide okunur; kapalıysa hiç istek atılmaz.
  useEffect(() => {
    setCapAllows(canShowPopupAd());
  }, []);

  const { ads } = useActiveAds("popup", capAllows && !done);
  const ad = pickAd(ads, "popup");

  const blocked = isPopupBlockedByOverlay({
    requiredStepsOutstanding: outstanding,
    cookieBannerOpen,
    tourRunning,
  });

  useEffect(() => {
    if (!ad || !capAllows || done || open || blocked) return;
    const timer = window.setTimeout(() => {
      if (!canShowPopupAd()) {
        setDone(true);
        return;
      }
      markPopupAdShown();
      setOpen(true);
    }, POPUP_AD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ad, capAllows, done, open, blocked]);

  const close = useCallback(() => {
    setOpen(false);
    setDone(true);
  }, []);

  return { ad: open ? ad : null, close };
}
