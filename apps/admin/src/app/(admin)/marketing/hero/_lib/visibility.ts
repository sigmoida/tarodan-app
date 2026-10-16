import {
  CLIENT_PLATFORMS,
  contentPlatformsFor,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import type { HeroSlide } from "./types";

/** Ana sayfa hero'sunun bir platformda neden gizli olduğu. */
export type HeroHiddenReason = "switchOff" | "noLiveSlide" | "hiddenInApp";

export interface HeroHiddenNote {
  platform: ClientPlatform;
  reason: HeroHiddenReason;
}

/**
 * Ana sayfa hero'sunun gizli olduğu platformlar — API'nin public okumasıyla
 * aynı kural: anahtar kapalıysa gizli; açıksa o platformda (kendi hedefi ya da
 * `all`) yayında slayt yoksa gizli. Anahtar önce gelir: kapalı platformda
 * slayt durumu önemsizdir. Uygulamada yayındaki slaytların HEPSİ `hideOnIos`
 * ("native uygulamada gizle": iOS VE Android) ise hero uygulamada gizlidir
 * (`hiddenInApp`) — süzme istemcidedir, API listesi boş dönmez.
 */
export function heroHiddenNotes(
  slides: readonly Pick<HeroSlide, "isLive" | "platform" | "hideOnIos">[],
  visibility: HeroHomeVisibilityDto,
): HeroHiddenNote[] {
  const notes: HeroHiddenNote[] = [];
  for (const platform of CLIENT_PLATFORMS) {
    if (!visibility[platform]) {
      notes.push({ platform, reason: "switchOff" });
      continue;
    }
    const targets = contentPlatformsFor(platform);
    const live = slides.filter((s) => s.isLive && targets.includes(s.platform));
    if (live.length === 0) {
      notes.push({ platform, reason: "noLiveSlide" });
    } else if (platform === "app" && live.every((s) => s.hideOnIos)) {
      notes.push({ platform, reason: "hiddenInApp" });
    }
  }
  return notes;
}
