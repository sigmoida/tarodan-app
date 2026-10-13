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
 *
 * Afişler oturum / limit sorgusunu BEKLEMEZ: üyenin katmanı bilinmezken
 * (`pending`) afişler paralel çekilir, yalnız çizilmez (`ads` boş). Gizleme
 * yalnız reklamsızlık kesinleşince olur. `reserved`: afişler hazır ama karar
 * bekliyor — yuva ölçüsünü yer tutucuyla korur (üst şerit; layout kayması olmasın).
 */
export function useActiveAds(position: AdPosition, enabled = true) {
  const device = useDeviceType();
  const visibility = useBannerVisibility();

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
    enabled: enabled && visibility !== "hidden" && device !== null,
    // Afişler saatlerce değişmez; her gezinmede yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Gizliyken ya da karar beklerken önbellekteki afişler çizilmesin (örn. oturum
  // açılmadan önce çekilmiş set reklamsız üyeye sızmasın).
  const ads = visibility === "visible" ? (query.data ?? []) : [];
  const reserved = visibility === "pending" && (query.data?.length ?? 0) > 0;
  return { ads, reserved, device };
}
