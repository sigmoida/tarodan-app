/** @format */

import type {
  HeroPlacement,
  HeroSlideDto,
  TrustBadgeDto,
} from "@tarodan/types";
import { getServerApiOrigin } from "./origin";

/**
 * Hero / güven rozeti içeriği — SUNUCU tarafı okuma. İçerik admin'den yönetilir;
 * API hata verirse ya da boş dönerse `[]` döner ve ilgili bölüm hiç çizilmez
 * (kodda yedek içerik yok). İstemci sayaçları `heroTracking.ts`te: bu modül
 * sunucu zincirinde olduğundan axios istemcisini çekmemeli.
 */
export type { HeroPlacement };

/** `revalidateTag` ile (app/api/revalidate) anında tazelenen önbellek etiketleri. */
export const HERO_CACHE_TAGS = {
  home: "home:hero",
  auth: "auth:hero",
  trust: "home:trust",
} as const;

const REVALIDATE_SECONDS = 300;

export function heroCacheTag(placement: HeroPlacement): string {
  return placement === "home" ? HERO_CACHE_TAGS.home : HERO_CACHE_TAGS.auth;
}

async function fetchList<T>(path: string, tag: string): Promise<T[]> {
  try {
    const res = await fetch(`${getServerApiOrigin()}/api${path}`, {
      next: { revalidate: REVALIDATE_SECONDS, tags: [tag] },
    });
    if (!res.ok) return [];
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as T[]) : [];
  } catch {
    return [];
  }
}

export function fetchHeroSlides(
  placement: HeroPlacement,
): Promise<HeroSlideDto[]> {
  return fetchList<HeroSlideDto>(
    `/hero-slides?placement=${placement}`,
    heroCacheTag(placement),
  );
}

export function fetchTrustBadges(): Promise<TrustBadgeDto[]> {
  return fetchList<TrustBadgeDto>("/trust-badges", HERO_CACHE_TAGS.trust);
}
