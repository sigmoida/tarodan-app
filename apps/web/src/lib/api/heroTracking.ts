/** @format */

import { sendTrackingBeacon } from "./beacon";
import { GATEWAY_BASE } from "./client";

export type HeroEvent = "impression" | "click";
export type HeroCtaIndex = 1 | 2;

/** API'deki hero denetleyicisinin kökü (`@Controller('hero-slides')`). */
const HERO_BASE = "/hero-slides";

/** Sayaç ucunun tarayıcıdaki adresi; `cta` yalnız tıklamada anlamlıdır. */
export function heroEventUrl(
  id: string,
  event: HeroEvent,
  cta?: HeroCtaIndex,
): string {
  const base = `${GATEWAY_BASE}${HERO_BASE}/${encodeURIComponent(id)}/${event}`;
  return event === "click" && cta ? `${base}?cta=${cta}` : base;
}

export function trackHeroEvent(
  id: string,
  event: HeroEvent,
  cta?: HeroCtaIndex,
): void {
  sendTrackingBeacon(heroEventUrl(id, event, cta));
}
