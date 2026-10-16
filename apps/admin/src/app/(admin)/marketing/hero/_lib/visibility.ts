import {
  CLIENT_PLATFORMS,
  contentPlatformsFor,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import type { HeroSlide } from "./types";

/** Ana sayfa hero'sunun bir platformda neden gizli olduğu. */
export type HeroHiddenReason = "switchOff" | "noLiveSlide";

export interface HeroHiddenNote {
  platform: ClientPlatform;
  reason: HeroHiddenReason;
}

/**
 * Ana sayfa hero'sunun gizli olduğu platformlar — API'nin public okumasıyla
 * aynı kural: anahtar kapalıysa gizli; açıksa o platformda (kendi hedefi ya da
 * `all`) yayında slayt yoksa gizli. Anahtar önce gelir: kapalı platformda
 * slayt durumu önemsizdir.
 */
export function heroHiddenNotes(
  slides: readonly Pick<HeroSlide, "isLive" | "platform">[],
  visibility: HeroHomeVisibilityDto,
): HeroHiddenNote[] {
  const notes: HeroHiddenNote[] = [];
  for (const platform of CLIENT_PLATFORMS) {
    if (!visibility[platform]) {
      notes.push({ platform, reason: "switchOff" });
      continue;
    }
    const targets = contentPlatformsFor(platform);
    if (!slides.some((s) => s.isLive && targets.includes(s.platform))) {
      notes.push({ platform, reason: "noLiveSlide" });
    }
  }
  return notes;
}
