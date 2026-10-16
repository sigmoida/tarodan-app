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
export function useHeroHomeVisibility() {
  return useQuery({
    queryKey: adminKeys.detail("hero-slides", "visibility"),
    queryFn: async (): Promise<HeroHomeVisibilityDto> =>
      (await adminApi.getHeroHomeVisibility()).data,
  });
}
