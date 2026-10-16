import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  ContentPlatform,
  HeroPlacement,
  HeroSlide,
  Prisma,
} from "@prisma/client";
import {
  HERO_MAX_SLIDES,
  clientPlatformsOf,
  contentPlatformsFor,
  type ClientPlatform,
  normalizeLocalizedText,
  parseLocalizedText,
  type AdminHeroSlideDto,
  type HeroCtaSlot,
  type HeroSlideDto,
  type LocalizedText,
} from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { MediaService } from "../media/media.service";
import { notifyWebRevalidate } from "../../common/helpers/revalidate";
import { i18nMessage } from "../i18n";
import { CreateHeroSlideDto, UpdateHeroSlideDto } from "./dto";
import {
  heroSlideLiveWhere,
  isHeroSlideLive,
  peakConcurrentWindows,
  type HeroLiveFields,
  type HeroWindow,
} from "./helpers/hero-live.helper";
import {
  localizedJson,
  nullableLocalizedJson,
  toAdminHeroSlideDto,
  toHeroSlideDto,
} from "./helpers/hero-slide.mapper";
import {
  HERO_IMAGE_UPLOAD,
  heroRevalidateTags,
} from "./helpers/hero.constants";
import { HeroVisibilityService } from "./hero-visibility.service";

/** Yerleşim içi sıra; eşitlikte önce eklenen önce. */
const HERO_SLIDE_ORDER_BY: Prisma.HeroSlideOrderByWithRelationInput[] = [
  { displayOrder: "asc" },
  { createdAt: "asc" },
];

/** Güncelleme alanı: `undefined` = dokunma, `null` = temizle, değer = yaz. */
function toDateField(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

/** İki pencere ucu aynı an mı (ikisi de null dahil). */
function sameInstant(a: Date | null, b: Date | null): boolean {
  return a === null || b === null ? a === b : a.getTime() === b.getTime();
}

/** Metin alanı yaması: `undefined` = dokunma; null ya da iki dili boş = temizle. */
function patchText(
  value: LocalizedText | null | undefined,
): LocalizedText | null | undefined {
  return value === undefined ? undefined : normalizeLocalizedText(value);
}

interface CtaPair {
  label: LocalizedText | null;
  href: string | null;
}

/** Yayın kuralının gördüğü slayt hali (yerleşim + hedef + anahtar + pencere). */
type HeroLiveState = HeroLiveFields & {
  placement: HeroPlacement;
  platform: ContentPlatform;
};

/** Bu hedefteki slaytla aynı istemcide görünebilecek hedefler. */
function platformsSharingClients(platform: ContentPlatform): ContentPlatform[] {
  return [...new Set(clientPlatformsOf(platform).flatMap(contentPlatformsFor))];
}

/**
 * Vitrin hero slaytları — public okuma ve admin yazma yolu (admin katmanı
 * denetim kaydını ekler, `AdminHeroService`). Her yazımdan sonra web'in ilgili
 * ISR etiketi tazelenir.
 *
 * İş kuralı: bir yerleşimde, bir istemcide AYNI ANDA en çok `HERO_MAX_SLIDES`
 * yayında slayt (409). Yerleşim boş kalabilir — istemci slider'ı gizler; ana
 * sayfa hero'su istemci başına anahtarla da kapatılabilir
 * (`HeroVisibilityService`).
 */
@Injectable()
export class HeroSlideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly visibility: HeroVisibilityService,
  ) {}

  /**
   * Yerleşimin bu istemcide yayındaki slaytları (public), sırasıyla. İstemci
   * kendi hedefini ve `all`'ı görür. Ana sayfa anahtarı o istemcide kapalıysa
   * boş döner; auth yerleşimleri anahtardan etkilenmez.
   */
  async listLive(
    placement: HeroPlacement,
    platform: ClientPlatform,
  ): Promise<HeroSlideDto[]> {
    const now = new Date();
    // Anahtar ve slaytlar paralel okunur; anahtar yalnız ana sayfada sorulur.
    const [enabled, slides] = await Promise.all([
      placement === "home"
        ? this.visibility.isHomeEnabled(platform)
        : Promise.resolve(true),
      this.prisma.heroSlide.findMany({
        where: {
          placement,
          platform: { in: contentPlatformsFor(platform) },
          ...heroSlideLiveWhere(now),
        },
        orderBy: HERO_SLIDE_ORDER_BY,
        take: HERO_MAX_SLIDES,
      }),
    ]);
    if (!enabled) return [];
    return slides
      .filter((slide) => isHeroSlideLive(slide, now))
      .map(toHeroSlideDto);
  }

  /** Admin listesi: pasif ve zamanlanmışlar dahil, sayaçlarıyla. */
  async list(placement?: HeroPlacement): Promise<AdminHeroSlideDto[]> {
    const now = new Date();
    const slides = await this.prisma.heroSlide.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: "asc" }, ...HERO_SLIDE_ORDER_BY],
    });
    return slides.map((slide) => toAdminHeroSlideDto(slide, now));
  }

  async get(id: string): Promise<AdminHeroSlideDto> {
    return toAdminHeroSlideDto(await this.findOrThrow(id));
  }

  async create(dto: CreateHeroSlideDto): Promise<AdminHeroSlideDto> {
    const now = new Date();
    const startDate = toDateField(dto.startDate) ?? null;
    const endDate = toDateField(dto.endDate) ?? null;
    this.assertWindowOrder(startDate, endDate);

    const title = normalizeLocalizedText(dto.title);
    // DTO zorunlu alanı doğruladı; normalize boşa düşüremez — yine de tip
    // güvencesi için açık kontrol.
    if (!title) {
      throw new BadRequestException(i18nMessage("server.hero.titleRequired"));
    }
    const cta1Label = normalizeLocalizedText(dto.cta1Label);
    const cta2Label = normalizeLocalizedText(dto.cta2Label);
    this.assertCtaPairs({
      1: { label: cta1Label, href: dto.cta1Href ?? null },
      2: { label: cta2Label, href: dto.cta2Href ?? null },
    });

    const isActive = dto.isActive ?? true;
    const platform = dto.platform ?? "all";
    if (isActive) {
      await this.assertLiveCapacity(
        dto.placement,
        platform,
        { startDate, endDate },
        now,
      );
    }

    const slide = await this.prisma.heroSlide.create({
      data: {
        placement: dto.placement,
        isActive,
        // Varsayılanların tek yeri burası (DTO'da başlangıç değeri yok).
        displayOrder:
          dto.displayOrder ?? (await this.nextDisplayOrder(dto.placement)),
        startDate,
        endDate,
        imageUrl: dto.imageUrl,
        mobileImageUrl: dto.mobileImageUrl ?? null,
        imageSide: dto.imageSide ?? "right",
        title: localizedJson(title),
        subtitle: nullableLocalizedJson(normalizeLocalizedText(dto.subtitle)),
        imageAlt: nullableLocalizedJson(normalizeLocalizedText(dto.imageAlt)),
        cta1Label: nullableLocalizedJson(cta1Label),
        cta1Href: dto.cta1Href ?? null,
        cta2Label: nullableLocalizedJson(cta2Label),
        cta2Href: dto.cta2Href ?? null,
        hideOnIos: dto.hideOnIos ?? false,
        platform,
      },
    });
    this.revalidate([slide.placement]);
    return toAdminHeroSlideDto(slide, now);
  }

  /** Alan yok (`undefined`) = dokunma; `null` = temizle. */
  async update(
    id: string,
    dto: UpdateHeroSlideDto,
  ): Promise<AdminHeroSlideDto> {
    const now = new Date();
    const existing = await this.findOrThrow(id);

    // Kurallar SONUÇ slayt üzerinde (saklı + yama) denetlenir.
    const startDate = toDateField(dto.startDate);
    const endDate = toDateField(dto.endDate);
    const next: HeroLiveState = {
      placement: dto.placement ?? existing.placement,
      platform: dto.platform ?? existing.platform,
      isActive: dto.isActive ?? existing.isActive,
      startDate: startDate === undefined ? existing.startDate : startDate,
      endDate: endDate === undefined ? existing.endDate : endDate,
    };
    this.assertWindowOrder(next.startDate, next.endDate);

    const title = patchText(dto.title);
    if (title === null) {
      throw new BadRequestException(i18nMessage("server.hero.titleRequired"));
    }
    const cta1Label = patchText(dto.cta1Label);
    const cta2Label = patchText(dto.cta2Label);
    this.assertCtaPairs({
      1: {
        label:
          cta1Label === undefined
            ? parseLocalizedText(existing.cta1Label)
            : cta1Label,
        href: dto.cta1Href === undefined ? existing.cta1Href : dto.cta1Href,
      },
      2: {
        label:
          cta2Label === undefined
            ? parseLocalizedText(existing.cta2Label)
            : cta2Label,
        href: dto.cta2Href === undefined ? existing.cta2Href : dto.cta2Href,
      },
    });

    // Yalnız yayın kümesini büyütebilecek değişiklik sınırı yoklar: açık bir
    // slaytın metnini düzeltmek, sınır zaten aşılmışsa bile engellenmez. Admin
    // formu her PATCH'te anahtar/pencere/yerleşimi de gönderir; "alan geldi"
    // değil "değer değişti" ölçülür, yoksa her metin düzeltmesi sınırı yoklardı.
    const mayGrowLiveSet =
      next.isActive &&
      (!existing.isActive ||
        next.placement !== existing.placement ||
        next.platform !== existing.platform ||
        !sameInstant(next.startDate, existing.startDate) ||
        !sameInstant(next.endDate, existing.endDate));
    if (mayGrowLiveSet) {
      await this.assertLiveCapacity(
        next.placement,
        next.platform,
        next,
        now,
        id,
      );
    }

    // Prisma'da `undefined` alanı yazmaz; `null` temizler.
    const slide = await this.prisma.heroSlide.update({
      where: { id },
      data: {
        placement: dto.placement,
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
        startDate,
        endDate,
        imageUrl: dto.imageUrl,
        mobileImageUrl: dto.mobileImageUrl,
        imageSide: dto.imageSide,
        title: title ? localizedJson(title) : undefined,
        subtitle: nullableLocalizedJson(patchText(dto.subtitle)),
        imageAlt: nullableLocalizedJson(patchText(dto.imageAlt)),
        cta1Label: nullableLocalizedJson(cta1Label),
        cta1Href: dto.cta1Href,
        cta2Label: nullableLocalizedJson(cta2Label),
        cta2Href: dto.cta2Href,
        hideOnIos: dto.hideOnIos,
        platform: dto.platform,
      },
    });
    this.revalidate([existing.placement, slide.placement]);
    return toAdminHeroSlideDto(slide, now);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOrThrow(id);
    await this.prisma.heroSlide.delete({ where: { id } });
    this.revalidate([existing.placement]);
  }

  /** Yerleşim içi sıra: dizi sırası = `displayOrder`. Tek yerleşim şart. */
  async reorder(ids: string[]): Promise<AdminHeroSlideDto[]> {
    const unique = [...new Set(ids)];
    const rows = await this.prisma.heroSlide.findMany({
      where: { id: { in: unique } },
      select: { id: true, placement: true },
    });
    if (rows.length !== unique.length) {
      throw new NotFoundException(i18nMessage("server.hero.notFound"));
    }
    const placement = rows[0].placement;
    if (rows.some((row) => row.placement !== placement)) {
      throw new BadRequestException(
        i18nMessage("server.hero.reorderMixedPlacement"),
      );
    }
    await this.prisma.$transaction(
      unique.map((id, index) =>
        this.prisma.heroSlide.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    this.revalidate([placement]);
    return this.list(placement);
  }

  /** Hero görseli yükle (admin) — dönen `url` doğrudan `imageUrl` olur. */
  async uploadImage(
    file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException(i18nMessage("server.admin.fileMissing"));
    }
    const { url } = await this.media.upload(file, HERO_IMAGE_UPLOAD);
    // Public kökte URL her zaman kurulur; yoksa boş URL kaydedilmesin.
    if (!url) {
      throw new ServiceUnavailableException(
        i18nMessage("server.storage.publicUrlNotConfigured"),
      );
    }
    return { url };
  }

  private async findOrThrow(id: string): Promise<HeroSlide> {
    const slide = await this.prisma.heroSlide.findUnique({ where: { id } });
    if (!slide) {
      throw new NotFoundException(i18nMessage("server.hero.notFound"));
    }
    return slide;
  }

  /** Yeni slayt yerleşimin sonuna eklenir. */
  private async nextDisplayOrder(placement: HeroPlacement): Promise<number> {
    const { _max } = await this.prisma.heroSlide.aggregate({
      where: { placement },
      _max: { displayOrder: true },
    });
    return (_max.displayOrder ?? -1) + 1;
  }

  /** Yayın penceresi ters olamaz: böyle bir slayt hiçbir an yayında olmaz. */
  private assertWindowOrder(start: Date | null, end: Date | null): void {
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException(i18nMessage("server.hero.endBeforeStart"));
    }
  }

  /** Buton etiketi ve hedefi birlikte var ya da birlikte yok. */
  private assertCtaPairs(pairs: Record<HeroCtaSlot, CtaPair>): void {
    for (const slot of [1, 2] as const) {
      const { label, href } = pairs[slot];
      if (Boolean(label) !== Boolean(href)) {
        throw new BadRequestException(
          i18nMessage("server.hero.ctaIncomplete", { slot }),
        );
      }
    }
  }

  /**
   * Yerleşimde, slaytın göründüğü HER istemcide aynı anda yayında olacak
   * slayt sayısı sınırı aşmamalı (`web` ile `app` slaytları birbirinin
   * sınırını tüketmez; `all` ikisinde de sayılır). Pencereler şimdiden
   * itibaren kesiştirilir (`peakConcurrentWindows`): başka bir slaytın
   * bitişinden sonraya zamanlanan slayt kabul edilir.
   */
  private async assertLiveCapacity(
    placement: HeroPlacement,
    platform: ContentPlatform,
    window: HeroWindow,
    now: Date,
    excludeId?: string,
  ): Promise<void> {
    const others = await this.prisma.heroSlide.findMany({
      where: {
        placement,
        isActive: true,
        platform: { in: platformsSharingClients(platform) },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      select: { startDate: true, endDate: true, platform: true },
    });
    for (const client of clientPlatformsOf(platform)) {
      const visible = contentPlatformsFor(client);
      const windows = others.filter((o) => visible.includes(o.platform));
      if (peakConcurrentWindows([...windows, window], now) > HERO_MAX_SLIDES) {
        throw new ConflictException(
          i18nMessage("server.hero.maxLiveSlides", { max: HERO_MAX_SLIDES }),
        );
      }
    }
  }

  private revalidate(placements: HeroPlacement[]): void {
    void notifyWebRevalidate(heroRevalidateTags(placements));
  }
}
