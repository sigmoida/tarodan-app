import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import { AD_LIVE_CAMPAIGN_SELECT, isAdLive } from "./helpers/ad-live.helper";
import {
  AD_TRACKING_DEDUPE_SECONDS,
  adTrackingDedupeKey,
  type AdTrackingKind,
} from "./helpers/ad-tracking.constants";

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

  recordImpression(adId: string, clientIp: string): Promise<void> {
    return this.record("impression", adId, clientIp);
  }

  recordClick(adId: string, clientIp: string): Promise<void> {
    return this.record("click", adId, clientIp);
  }

  private async record(
    kind: AdTrackingKind,
    adId: string,
    clientIp: string,
  ): Promise<void> {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: adId },
      select: {
        isActive: true,
        startDate: true,
        endDate: true,
        discount: { select: AD_LIVE_CAMPAIGN_SELECT },
      },
    });
    // Seçimle AYNI kural: vitrinde olmayan reklama sayaç yazılmaz.
    if (!ad || !isAdLive(ad)) return;

    const firstInWindow = await this.cache.setIfAbsent(
      adTrackingDedupeKey(kind, adId, clientIp),
      AD_TRACKING_DEDUPE_SECONDS[kind],
    );
    if (!firstInWindow) return;

    // updateMany: okuma ile yazma arasında silinen reklam P2025 fırlatmasın.
    await this.prisma.advertisement.updateMany({
      where: { id: adId },
      data:
        kind === "click"
          ? { clickCount: { increment: 1 } }
          : { impressionCount: { increment: 1 } },
    });
  }
}
