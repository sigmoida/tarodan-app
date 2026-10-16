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

/**
 * Konumdaki yayındaki afiş(ler) — site (`platform=web`) için. API yuva başına
 * en fazla bir afiş döner; liste biçimi eski yanıtlarla uyum içindir. Yuva
 * render'ı react-query bağlamı gerektirir (QueryProvider içinde kullanın).
 */
export function useActiveAds(position: AdPosition, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.ads.active(position),
    queryFn: async () => {
      const res = await advertisementsApi.getActive({ position });
      const body = res.data?.data ?? res.data ?? [];
      const list = (Array.isArray(body) ? body : []) as Advertisement[];
      return list.map(normalizeAd);
    },
    enabled,
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
