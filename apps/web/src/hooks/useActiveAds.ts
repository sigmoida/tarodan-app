/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  advertisementsApi,
  type Advertisement,
  type AdPosition,
} from "@/lib/api/advertisements";
import { useDeviceType } from "./useDeviceType";

/**
 * Konumdaki yayındaki afişler (displayOrder sırasıyla). Cihaz bilinmeden istek
 * atılmaz; cihaz anahtarda olduğu için ekran daralıp genişleyince doğru set
 * gelir ve eski cihazın geç yanıtı yeni sonucun üstüne yazmaz. Yuva render'ı
 * react-query bağlamı gerektirir (QueryProvider içinde kullanın).
 */
export function useActiveAds(position: AdPosition, enabled = true) {
  const device = useDeviceType();

  const query = useQuery({
    queryKey: ["advertisements", position, device],
    queryFn: async () => {
      const res = await advertisementsApi.getActive({
        position,
        deviceType: device ?? undefined,
      });
      const body = res.data?.data ?? res.data ?? [];
      return (Array.isArray(body) ? body : []) as Advertisement[];
    },
    enabled: enabled && device !== null,
    // Afişler saatlerce değişmez; her gezinmede yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { ads: query.data ?? [], device };
}
