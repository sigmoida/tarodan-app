/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import { AD_POPUP_FREQUENCY_DEFAULT } from "@tarodan/types";
import {
  advertisementsApi,
  type Advertisement,
  type AdPosition,
} from "@/lib/api/advertisements";
import { queryKeys } from "@/lib/query/keys";
import { useDeviceType } from "./useDeviceType";

/**
 * Konumdaki yayındaki afiş(ler) — site (`platform=web`) için. API yuva başına
 * en fazla bir afiş döner; liste biçimi eski yanıtlarla uyum içindir. Yuva
 * render'ı react-query bağlamı gerektirir (QueryProvider içinde kullanın).
 *
 * Geçiş dönemi: istek eski `device` parametresini de taşır (bkz.
 * `useDeviceType`); cihaz bilinmeden istek atılmaz.
 */
export function useActiveAds(position: AdPosition, enabled = true) {
  const device = useDeviceType();
  const query = useQuery({
    queryKey: queryKeys.ads.active(position, device),
    queryFn: async () => {
      const res = await advertisementsApi.getActive({
        position,
        device: device ?? undefined,
      });
      const body = res.data?.data ?? res.data ?? [];
      const list = (Array.isArray(body) ? body : []) as Advertisement[];
      return list.map(normalizeAd);
    },
    enabled: enabled && device !== null,
    // Afişler saatlerce değişmez; her gezinmede yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { ads: query.data ?? [] };
}

/**
 * Eski API yanıtında olmayan alanlar: `hotspots` → boş, popup sıklığı →
 * şema varsayılanı, sürüm → 1 (kapatma kaydı yine reklam başına tutulur).
 */
export function normalizeAd(ad: Advertisement): Advertisement {
  return {
    ...ad,
    hotspots: ad.hotspots ?? [],
    popupFrequency: ad.popupFrequency ?? AD_POPUP_FREQUENCY_DEFAULT,
    popupVersion: ad.popupVersion ?? 1,
  };
}
