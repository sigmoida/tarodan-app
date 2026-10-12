import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { HeroCtaSlot } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { CacheService } from "../cache/cache.service";
import {
  BEACON_DEDUPE_SECONDS,
  type BeaconTrackingKind,
} from "../../common/helpers/beacon-tracking";
import { isHeroSlideLive } from "./helpers/hero-live.helper";
import { heroSlideCta } from "./helpers/hero-slide.mapper";
import {
  heroTrackingDedupeKey,
  parseHeroCtaParam,
} from "./helpers/hero-tracking.helper";

/** Yayın kuralı + buton varlığı için okunan slayt alanları. */
const TRACKED_SLIDE_SELECT = {
  isActive: true,
  startDate: true,
  endDate: true,
  cta1Label: true,
  cta1Href: true,
  cta2Label: true,
  cta2Href: true,
} as const satisfies Prisma.HeroSlideSelect;

/**
 * Tıkın yazımı: slayt toplamı her zaman, buton tıkında o butonun sayacı da —
 * tek satır yazımında, birlikte artar ya da hiç artmaz.
 */
function clickIncrement(
  slot: HeroCtaSlot | undefined,
): Prisma.HeroSlideUpdateManyMutationInput {
  const total = { clickCount: { increment: 1 } };
  if (slot === 1) return { ...total, cta1ClickCount: { increment: 1 } };
  if (slot === 2) return { ...total, cta2ClickCount: { increment: 1 } };
  return total;
}

/**
 * Hero tık/gösterim sayımı (public, `navigator.sendBeacon` dostu) — reklam
 * sayımıyla aynı desen ve aynı pencereler.
 *
 * Sayılmayan istek de başarıdır (204): yayında olmayan slayt, bilinmeyen id,
 * olmayan buton ve pencere içindeki tekrar sessizce yok sayılır. İstemci
 * yanıtı okumuyor; hata dönmek yalnız id'lerin varlığını yoklamaya yarardı.
 */
@Injectable()
export class HeroTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // Yazımlar updateMany: okuma ile yazma arasında silinen slayt P2025
  // fırlatmasın.
  async recordImpression(slideId: string, clientIp: string): Promise<void> {
    if (!(await this.findLive(slideId))) return;
    if (!(await this.claim("impression", slideId, clientIp))) return;
    await this.prisma.heroSlide.updateMany({
      where: { id: slideId },
      data: { impressionCount: { increment: 1 } },
    });
  }

  /**
   * Tık. `cta` ham sorgu değeridir (`?cta=1|2`): verilmezse slaydın kendisine
   * (görsele) tık sayılır; verilirse slaytta o buton olmalı ve slayt toplamı
   * ile buton sayacı aynı satır yazımında birlikte artar.
   */
  async recordClick(
    slideId: string,
    clientIp: string,
    cta?: unknown,
  ): Promise<void> {
    const slot = parseHeroCtaParam(cta);
    if (slot === null) return;

    const slide = await this.findLive(slideId);
    if (!slide) return;
    if (slot !== undefined && !heroSlideCta(slide, slot)) return;
    if (!(await this.claim("click", slideId, clientIp, slot))) return;

    await this.prisma.heroSlide.updateMany({
      where: { id: slideId },
      data: clickIncrement(slot),
    });
  }

  /** Yayındaki slayt ya da null. Vitrinle AYNI kural (`isHeroSlideLive`). */
  private async findLive(slideId: string) {
    const slide = await this.prisma.heroSlide.findUnique({
      where: { id: slideId },
      select: TRACKED_SLIDE_SELECT,
    });
    return slide && isHeroSlideLive(slide) ? slide : null;
  }

  /** Pencerenin ilk isteği mi? Anahtar yalnız sayılacak istekte yakılır. */
  private claim(
    kind: BeaconTrackingKind,
    slideId: string,
    clientIp: string,
    cta?: HeroCtaSlot,
  ): Promise<boolean> {
    return this.cache.setIfAbsent(
      heroTrackingDedupeKey(kind, slideId, clientIp, cta),
      BEACON_DEDUPE_SECONDS[kind],
    );
  }
}
