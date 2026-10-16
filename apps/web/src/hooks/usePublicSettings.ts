"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  offerPriceFloor,
  parsePriceLimits,
  type PriceLimits,
} from "@tarodan/listing-form/price-limits";
import { publicSettingsApi, type PublicSettings } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

const SETTINGS_STALE_MS = 5 * 60_000;

/**
 * Herkese açık platform ayarları — uygulamadaki TEK istemci okuması. Aynı sorgu
 * anahtarı mesaj uzunluğunu ve ilan fiyat sınırlarını tek isteğe bağlar
 * (bileşen başına fetch yok).
 */
export function usePublicSettings({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery<PublicSettings>({
    queryKey: queryKeys.publicSettings.all(),
    queryFn: async () => (await publicSettingsApi.get()).data || {},
    staleTime: SETTINGS_STALE_MS,
    enabled,
    meta: { page: "public-settings" },
  });
}

/**
 * İlan/teklif fiyat sınırları (admin ayarı; boş = kural yok). Yüklenene ya da
 * istek başarısız olana kadar sınır YOK döner: form engellenmez, sunucu
 * yetkili kalır.
 */
export function usePriceLimits(): PriceLimits {
  const { data } = usePublicSettings();
  return useMemo(() => parsePriceLimits(data), [data]);
}

/**
 * Teklif/karşı teklif tutarının alt sınırı (null = kural yok). `effectivePrice`
 * ilanın güncel satış fiyatıdır; ilan zaten sınırın altındaysa taban yoktur
 * (bkz. `offerPriceFloor`). Tüm teklif ekranları aynı kuralı buradan okur.
 */
export function useOfferFloor(effectivePrice: number): number | null {
  const { minPrice } = usePriceLimits();
  return offerPriceFloor(minPrice, effectivePrice);
}
