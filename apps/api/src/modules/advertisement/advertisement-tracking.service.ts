import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { AD_LIVE_CAMPAIGN_SELECT, isAdLive } from "./helpers/ad-live.helper";
import {
  adCountsPlainClick,
  parseAdHotspotParam,
} from "./helpers/ad-hotspot.helper";
import {
  AD_TRACKING_DEDUPE_SECONDS,
  adTrackingDedupeKey,
  type AdTrackingKind,
} from "./helpers/ad-tracking.constants";

/** Yayın kuralı + tık hedefi kuralı için okunan reklam alanları. */
const TRACKED_AD_SELECT = {
  isActive: true,
  startDate: true,
  endDate: true,
  discount: { select: AD_LIVE_CAMPAIGN_SELECT },
  imageUrl: true,
  linkUrl: true,
} as const satisfies Prisma.AdvertisementSelect;

/**
 * Reklam tık/gösterim sayımı (public, `navigator.sendBeacon` dostu).
 *
 * Sayılmayan istek de başarıdır (204): yayında olmayan reklam, bilinmeyen
 * id ve pencere içindeki tekrar sessizce yok sayılır. İstemci zaten yanıtı
 * okumuyor (beacon okuyamaz); hata dönmek yalnız id'lerin varlığını
 * yoklamaya yarardı.
 */
@Injectable()
export class AdvertisementTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // Yazımlar updateMany: okuma ile yazma arasında silinen reklam/alan P2025
  // fırlatmasın.
  async recordImpression(adId: string, clientIp: string): Promise<void> {
    if (!(await this.findLive(adId))) return;
    if (!(await this.claim("impression", adId, clientIp))) return;
    await this.prisma.advertisement.updateMany({
      where: { id: adId },
      data: { impressionCount: { increment: 1 } },
    });
  }

  /**
   * Tık. `hotspot` ham sorgu değeridir (`?hotspot=<id>`):
   *  - verilirse geçerli uuid olmalı VE bu reklama ait olmalı; o zaman hem
   *    reklamın hem alanın sayacı tek işlemde artar,
   *  - verilmezse yalnız görselsiz reklamın tek bağlantısı sayılır —
   *    görselli reklamda tıklama ancak bir alana düşer.
   * Geçersiz/yabancı alan hata değil, yok sayılır (beacon hatayı okuyamaz).
   */
  async recordClick(
    adId: string,
    clientIp: string,
    hotspot?: unknown,
  ): Promise<void> {
    const hotspotId = parseAdHotspotParam(hotspot);
    if (hotspotId === null) return;

    const ad = await this.findLive(adId);
    if (!ad) return;

    if (hotspotId === undefined) {
      if (!adCountsPlainClick(ad)) return;
      if (!(await this.claim("click", adId, clientIp))) return;
      await this.prisma.advertisement.updateMany({
        where: { id: adId },
        data: { clickCount: { increment: 1 } },
      });
      return;
    }

    const owned = await this.prisma.adHotspot.findFirst({
      where: { id: hotspotId, advertisementId: adId },
      select: { id: true },
    });
    if (!owned) return;
    if (!(await this.claim("click", adId, clientIp, hotspotId))) return;
    // Reklam toplamı ile alan sayacı birlikte artar ya da hiç artmaz.
    await this.prisma.$transaction([
      this.prisma.advertisement.updateMany({
        where: { id: adId },
        data: { clickCount: { increment: 1 } },
      }),
      this.prisma.adHotspot.updateMany({
        where: { id: hotspotId, advertisementId: adId },
        data: { clickCount: { increment: 1 } },
      }),
    ]);
  }

  /** Yayındaki reklam ya da null. Seçimle AYNI kural (`isAdLive`). */
  private async findLive(adId: string) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: adId },
      select: TRACKED_AD_SELECT,
    });
    // Vitrinde olmayan reklama sayaç yazılmaz.
    return ad && isAdLive(ad) ? ad : null;
  }

  /** Pencerenin ilk isteği mi? Anahtar yalnız sayılacak istekte yakılır. */
  private claim(
    kind: AdTrackingKind,
    adId: string,
    clientIp: string,
    hotspotId?: string,
  ): Promise<boolean> {
    return this.cache.setIfAbsent(
      adTrackingDedupeKey(kind, adId, clientIp, hotspotId),
      AD_TRACKING_DEDUPE_SECONDS[kind],
    );
  }
}
