"use client";

import { useQuery } from "@tanstack/react-query";
import type { HeroHomeVisibilityDto } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";

/**
 * Ana sayfa hero'sunun platform anahtarları (`{ web, app }`). Anahtar
 * `hero-slides` altında: slayt ya da anahtar yazımı (`invalidates:
 * ["hero-slides"]`) liste ile birlikte bunu da tazeler.
 */
export const HERO_VISIBILITY_QUERY_KEY = adminKeys.detail(
  "hero-slides",
  "visibility",
);

/** `enabled: false` → okunmaz (anahtarlar yalnız Ana sayfa sekmesinde gerekir). */
export function useHeroHomeVisibility(enabled = true) {
  return useQuery({
    queryKey: HERO_VISIBILITY_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<HeroHomeVisibilityDto> =>
      (await adminApi.getHeroHomeVisibility()).data,
  });
}
