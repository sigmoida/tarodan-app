import {
  CLIENT_PLATFORMS,
  clientPlatformsOf,
  contentPlatformsFor,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import type { HeroSlide } from "./types";

/**
 * Ana sayfa hero'sunun bir platformdaki durumu:
 * - `live`: anahtar açık ve en az bir slayt o platformda görünüyor,
 * - `switchOff`: anahtar kapalı (slayt durumu önemsiz),
 * - `noLiveSlide`: anahtar açık ama o platformda yayında slayt yok,
 * - `hiddenInApp`: uygulamada yayındaki slaytların HEPSİ `hideOnIos`
 *   ("native uygulamada gösterme": iOS VE Android).
 */
export type HeroClientState =
  "live" | "switchOff" | "noLiveSlide" | "hiddenInApp";

export interface HeroClientSummary {
  platform: ClientPlatform;
  state: HeroClientState;
  /** O platformda gerçekten görünen yayındaki slayt sayısı (`live` dışında 0). */
  liveCount: number;
}

type SlideVisibilityFields = Pick<
  HeroSlide,
  "isLive" | "platform" | "hideOnIos"
>;

/**
 * Ana sayfa görünürlük kartının satırları — API'nin public okumasıyla aynı
 * kural: anahtar kapalıysa gizli; açıksa o platformda (kendi hedefi ya da
 * `all`) yayında slayt yoksa gizli. Anahtar önce gelir. Uygulamada süzme
 * (`hideOnIos`) istemcidedir: API listesi boş dönmez ama uygulama çizmez.
 */
export function heroClientSummaries(
  slides: readonly SlideVisibilityFields[],
  visibility: HeroHomeVisibilityDto,
): HeroClientSummary[] {
  return CLIENT_PLATFORMS.map((platform): HeroClientSummary => {
    if (!visibility[platform]) {
      return { platform, state: "switchOff", liveCount: 0 };
    }
    const targets = contentPlatformsFor(platform);
    const live = slides.filter((s) => s.isLive && targets.includes(s.platform));
    if (live.length === 0) {
      return { platform, state: "noLiveSlide", liveCount: 0 };
    }
    const shown =
      platform === "app"
        ? live.filter((s) => !s.hideOnIos).length
        : live.length;
    if (shown === 0) {
      return { platform, state: "hiddenInApp", liveCount: 0 };
    }
    return { platform, state: "live", liveCount: shown };
  });
}

/**
 * Bir slaytın, anahtarı kapalı olduğu için ana sayfada GÖRÜNMEDİĞİ
 * platformlar. Uygulamada zaten gizli olan (`hideOnIos`) slayt için uygulama
 * sayılmaz — o durum "Mobil" sütununda görünür.
 */
export function heroSwitchHiddenOn(
  slide: Pick<HeroSlide, "platform" | "hideOnIos">,
  visibility: HeroHomeVisibilityDto,
): ClientPlatform[] {
  return clientPlatformsOf(slide.platform).filter(
    (p) => !(p === "app" && slide.hideOnIos) && !visibility[p],
  );
}
