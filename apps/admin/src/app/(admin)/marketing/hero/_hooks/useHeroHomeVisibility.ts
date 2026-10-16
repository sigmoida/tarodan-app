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

export function useHeroHomeVisibility() {
  return useQuery({
    queryKey: HERO_VISIBILITY_QUERY_KEY,
    queryFn: async (): Promise<HeroHomeVisibilityDto> =>
      (await adminApi.getHeroHomeVisibility()).data,
  });
}
