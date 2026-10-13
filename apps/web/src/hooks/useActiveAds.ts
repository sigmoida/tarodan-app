/** @format */

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  advertisementsApi,
  type Advertisement,
  type AdPosition,
} from "@/lib/api/advertisements";
import { useBannerVisibility } from "./useBannerVisibility";
import { useDeviceType } from "./useDeviceType";

/**
 * Konumdaki yayındaki afişler (displayOrder sırasıyla). Cihaz bilinmeden istek
 * atılmaz; cihaz anahtarda olduğu için ekran daralıp genişleyince doğru set
 * gelir ve eski cihazın geç yanıtı yeni sonucun üstüne yazmaz. Yuva render'ı
 * react-query bağlamı gerektirir (QueryProvider içinde kullanın).
 *
 * TÜM reklam yuvaları (banner, satır arası, üst şerit, popup) afişi buradan alır;
 * reklamsız katmandaki üyeye (admin → Üyelik Katmanları → "reklamsız") hiçbir
 * yuva afiş göstermez ve istek de atılmaz — kural tek yerde
 * (`useBannerVisibility`), yuvalar ayrı ayrı uygulamaz.
 */
export function useActiveAds(position: AdPosition, enabled = true) {
  const device = useDeviceType();
  const visible = useBannerVisibility();

  const query = useQuery({
    queryKey: ["advertisements", position, device],
    queryFn: async () => {
      const res = await advertisementsApi.getActive({
        position,
        deviceType: device ?? undefined,
      });
      const body = res.data?.data ?? res.data ?? [];
      const list = (Array.isArray(body) ? body : []) as Advertisement[];
      // Eski API yanıtında `hotspots` yok → boş say.
      return list.map((ad) => ({ ...ad, hotspots: ad.hotspots ?? [] }));
    },
    enabled: enabled && visible && device !== null,
    // Afişler saatlerce değişmez; her gezinmede yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Gizliyken önbellekteki (örn. oturum açılmadan önce çekilmiş) afişler de
  // sızmasın.
  return { ads: visible ? (query.data ?? []) : [], device };
}
