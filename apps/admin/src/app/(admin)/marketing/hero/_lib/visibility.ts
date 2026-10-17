import {
  CLIENT_PLATFORMS,
  clientPlatformsOf,
  contentPlatformsFor,
  heroHasOnlyStoreCtas,
  type ClientPlatform,
  type HeroHomeVisibilityDto,
} from "@tarodan/types";
import type { HeroSlide } from "./types";

/**
 * Ana sayfa hero'sunun bir platformdaki durumu:
 * - `live`: anahtar açık ve en az bir slayt o platformda görünüyor,
 * - `switchOff`: anahtar kapalı (slayt durumu önemsiz),
 * - `noLiveSlide`: anahtar açık ama o platformda yayında slayt yok,
 * - `hiddenInApp`: uygulamada yayındaki slaytların HEPSİ uygulamada çizilmiyor —
 *   `hideOnIos` ("native uygulamada gösterme": iOS VE Android) ya da yalnız
 *   mağaza butonlu ("uygulamayı indir" tanıtımı; `heroHasOnlyStoreCtas`).
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
  "isLive" | "platform" | "hideOnIos" | "cta1Href" | "cta2Href"
>;

/** Mobil uygulamanın kendi süzmesiyle aynı: butonlarının hepsi mağaza bağlantısı. */
function storeOnly(slide: Pick<HeroSlide, "cta1Href" | "cta2Href">): boolean {
  return heroHasOnlyStoreCtas([slide.cta1Href, slide.cta2Href]);
}

/**
 * Ana sayfa görünürlük kartının satırları — API'nin public okumasıyla aynı
 * kural: anahtar kapalıysa gizli; açıksa o platformda (kendi hedefi ya da
 * `all`) yayında slayt yoksa gizli. Anahtar önce gelir. Uygulamada süzme
 * (`hideOnIos`, yalnız mağaza butonlu slayt) istemcidedir: API listesi boş
 * dönmez ama uygulama çizmez — bu slaytlar uygulamada sayılmaz.
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
        ? live.filter((s) => !s.hideOnIos && !storeOnly(s)).length
        : live.length;
    if (shown === 0) {
      return { platform, state: "hiddenInApp", liveCount: 0 };
    }
    return { platform, state: "live", liveCount: shown };
  });
}

/**
 * Yayındaki bir slaytın ana sayfada GÖRÜNMEDİĞİ platformlar (kartla aynı
 * kural): platform anahtarı kapalı ya da — uygulamada — yalnız mağaza butonlu.
 * Uygulamada zaten gizli olan (`hideOnIos`) slayt için uygulama sayılmaz — o
 * durum "Mobil" sütununda görünür.
 */
export function heroHiddenOn(
  slide: Pick<HeroSlide, "platform" | "hideOnIos" | "cta1Href" | "cta2Href">,
  visibility: HeroHomeVisibilityDto,
): ClientPlatform[] {
  return clientPlatformsOf(slide.platform).filter((p) => {
    if (p === "app" && slide.hideOnIos) return false;
    if (!visibility[p]) return true;
    return p === "app" && storeOnly(slide);
  });
}
