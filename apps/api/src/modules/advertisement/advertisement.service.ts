import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import {
  AdPopupFrequency,
  AdPosition,
  ContentPlatform,
  Prisma,
} from "@prisma/client";
import { contentPlatformsFor } from "@tarodan/types";
import { PrismaService } from "../../prisma";
import { MediaService, type UploadResult } from "../media/media.service";
import {
  CreateAdvertisementDto,
  IAB_STANDARD_SIZES,
} from "./dto/create-advertisement.dto";
import { UpdateAdvertisementDto } from "./dto/update-advertisement.dto";
import {
  AD_LIVE_CAMPAIGN_SELECT,
  adLiveWhere,
  isAdLive,
} from "./helpers/ad-live.helper";
import { AD_IMAGE_UPLOAD } from "./helpers/ad-image-upload.constants";
import {
  adDeviceTypeFor,
  adSlotConflictWhere,
  firstAdPerPosition,
  resolveAdClientPlatform,
  type AdSlotCandidate,
} from "./helpers/ad-platform.helper";
import {
  AD_HOTSPOT_ADMIN_SELECT,
  AD_HOTSPOT_ORDER_BY,
  AD_HOTSPOT_PUBLIC_SELECT,
  adHotspotRowData,
  planAdHotspotReplace,
  resolveAdClickTargets,
  type AdHotspotChange,
} from "./helpers/ad-hotspot.helper";
import { i18nMessage } from "../i18n";

/** Pozisyon / platform başına sayaç özeti (istatistik ekranı). */
type AdCounterBucket = { count: number; clicks: number; impressions: number };

/**
 * Admin yanıtındaki kampanya özeti: liste "kampanya bitti" durumunu bundan
 * gösterir (afiş açık ama bağlı kampanya bittiği için yayında değil).
 */
const ADMIN_CAMPAIGN_SELECT = {
  id: true,
  name: true,
  isActive: true,
  startDate: true,
  endDate: true,
} as const satisfies Prisma.DiscountSelect;

const ADMIN_AD_INCLUDE = {
  discount: { select: ADMIN_CAMPAIGN_SELECT },
  // Admin alan başına tık sayısını da görür (istatistik).
  hotspots: { select: AD_HOTSPOT_ADMIN_SELECT, orderBy: AD_HOTSPOT_ORDER_BY },
} as const satisfies Prisma.AdvertisementInclude;

type AdminAdRow = Prisma.AdvertisementGetPayload<{
  include: typeof ADMIN_AD_INCLUDE;
}>;

const AD_POSITIONS = new Set<string>(Object.values(AdPosition));
const CONTENT_PLATFORMS = new Set<string>(Object.values(ContentPlatform));

/** Yuvayı belirleyen alanlardan biri güncellemede değişiyor mu. */
function slotChanged(existing: AdSlotCandidate, next: AdSlotCandidate) {
  return (
    existing.position !== next.position ||
    existing.platform !== next.platform ||
    existing.isActive !== next.isActive ||
    existing.startDate?.getTime() !== next.startDate?.getTime() ||
    existing.endDate?.getTime() !== next.endDate?.getTime()
  );
}

/** Güncelleme alanı: `undefined` = dokunma, `null` = temizle, değer = yaz. */
function toDateField(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

@Injectable()
export class AdvertisementService {
  private readonly logger = new Logger(AdvertisementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  private get adRepo() {
    return this.prisma.advertisement;
  }

  /**
   * Check if dimensions match IAB standard sizes
   */
  checkIABCompliance(
    width?: number | null,
    height?: number | null,
  ): { isCompliant: boolean; matchedSize?: string; suggestions: string[] } {
    if (!width || !height) {
      return {
        isCompliant: false,
        suggestions: IAB_STANDARD_SIZES.map(
          (s) => `${s.name}: ${s.width}x${s.height}`,
        ),
      };
    }

    const matched = IAB_STANDARD_SIZES.find(
      (s) => s.width === width && s.height === height,
    );
    if (matched) {
      return { isCompliant: true, matchedSize: matched.name, suggestions: [] };
    }

    // Find closest sizes
    const suggestions = IAB_STANDARD_SIZES.map((s) => ({
      ...s,
      diff: Math.abs(s.width - width) + Math.abs(s.height - height),
    }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3)
      .map((s) => `${s.name}: ${s.width}x${s.height}`);

    return { isCompliant: false, suggestions };
  }

  /**
   * İstemcinin yayındaki reklamları (public): yuva başına EN FAZLA BİR,
   * `displayOrder ASC, createdAt DESC` sırasıyla ilk olan. Bir yuvada tek
   * reklam kuralı yazımda uygulanır (`assertSlotFree`); bu süzme kural
   * öncesinden kalan veriye karşı güvenlik ağıdır. "Yayında" kuralı
   * `isAdLive`'dır; veritabanı süzmesi (`adLiveWhere`) yalnız daraltır.
   *
   * İstemci `platform` (web | app) ile seçilir; parametre yoksa eski mobil
   * sürüm sayılır (`resolveAdClientPlatform`). Eski `device` yalnız bu
   * çözümlemede ipucudur, süzmez.
   */
  async getActive(position?: string, platform?: string, legacyDevice?: string) {
    // Bilinmeyen yuva/platform (ör. kaldırılan `sidebar`) hiçbir reklamla
    // eşleşmez; sorguyu Prisma'nın enum hatasına bırakmayız.
    if (position && !AD_POSITIONS.has(position)) return [];
    const client = resolveAdClientPlatform(platform, legacyDevice);
    if (!client) return [];

    try {
      const now = new Date();
      const where: Prisma.AdvertisementWhereInput = {
        ...adLiveWhere(now),
        // İstemcinin kendisi + `all` hedefli reklamlar.
        platform: { in: contentPlatformsFor(client) },
      };

      if (position) {
        where.position = position as AdPosition;
      }

      const ads = await this.adRepo.findMany({
        where,
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        include: {
          discount: {
            select: {
              ...AD_LIVE_CAMPAIGN_SELECT,
              id: true,
              name: true,
              code: true,
              target: true,
              isFlashSale: true,
            },
          },
          hotspots: {
            select: AD_HOTSPOT_PUBLIC_SELECT,
            orderBy: AD_HOTSPOT_ORDER_BY,
          },
        },
      });

      return firstAdPerPosition(ads.filter((a) => isAdLive(a, now))).map(
        (a) => ({
          id: a.id,
          title: a.title,
          imageUrl: a.imageUrl,
          linkUrl: a.linkUrl,
          content: a.content,
          altText: a.altText,
          width: a.width,
          height: a.height,
          position: a.position,
          platform: a.platform,
          // Eski mobil sürümler bununla süzüyor (`all | mobile`): kolondan
          // değil platformdan türetilir, ikisi ayrışamaz.
          deviceType: adDeviceTypeFor(a.platform),
          // Popup sıklığı; istemci "kapatıldı" bilgisini
          // `<id>:<popupVersion>` ile saklar (admin güncelleyince yeniden açılır).
          popupFrequency: a.popupFrequency,
          popupVersion: a.popupVersion,
          // Görselli reklamda tıklama YALNIZ bu alanlarda olur (`linkUrl` null);
          // istemci tıkı `POST /ads/:id/click?hotspot=<id>` ile bildirir.
          hotspots: a.hotspots,
          campaign: a.discount
            ? {
                id: a.discount.id,
                name: a.discount.name,
                code: a.discount.code,
                target: a.discount.target,
                // Flash kampanyada şerit geri sayım gösterir: aciliyet duyurunun
                // kendisidir. (Bayrak eskiden hiçbir şey yapmıyordu.)
                isFlashSale: a.discount.isFlashSale,
                endsAt: a.discount.endDate,
              }
            : null,
        }),
      );
    } catch (err) {
      this.logger.warn(`getActive failed: ${err}`);
      return [];
    }
  }

  /**
   * Reklam görseli yükle (admin). `products/ads` public köküne gider; dönen
   * `url` doğrudan `imageUrl` olarak kaydedilir.
   */
  async uploadImage(file: Express.Multer.File | undefined): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException(i18nMessage("server.admin.fileMissing"));
    }
    return this.media.upload(file, AD_IMAGE_UPLOAD);
  }

  /**
   * Get IAB standard sizes
   */
  getIABSizes() {
    return IAB_STANDARD_SIZES;
  }

  /**
   * List all ads (admin).
   */
  async findAll(position?: string, platform?: string, isActive?: boolean) {
    const where: Prisma.AdvertisementWhereInput = {};
    if (position) {
      if (!AD_POSITIONS.has(position)) return [];
      where.position = position as AdPosition;
    }
    if (platform) {
      if (!CONTENT_PLATFORMS.has(platform)) return [];
      where.platform = platform as ContentPlatform;
    }
    if (typeof isActive === "boolean") where.isActive = isActive;

    const ads = await this.adRepo.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      include: ADMIN_AD_INCLUDE,
    });

    return ads.map((a) => this.toResponse(a));
  }

  /**
   * Get ad statistics summary
   */
  async getStatistics() {
    const ads = await this.adRepo.findMany({});

    const totalAds = ads.length;
    const activeAds = ads.filter((a) => a.isActive).length;
    const totalClicks = ads.reduce((sum, a) => sum + (a.clickCount || 0), 0);
    const totalImpressions = ads.reduce(
      (sum, a) => sum + (a.impressionCount || 0),
      0,
    );
    const avgCTR =
      totalImpressions > 0
        ? ((totalClicks / totalImpressions) * 100).toFixed(2)
        : "0.00";

    // Group by position
    const byPosition = ads.reduce<Record<string, AdCounterBucket>>((acc, a) => {
      const pos = a.position || "header";
      if (!acc[pos]) acc[pos] = { count: 0, clicks: 0, impressions: 0 };
      acc[pos].count++;
      acc[pos].clicks += a.clickCount || 0;
      acc[pos].impressions += a.impressionCount || 0;
      return acc;
    }, {});

    // Group by platform
    const byPlatform = ads.reduce<Record<string, AdCounterBucket>>((acc, a) => {
      const platform = a.platform || ContentPlatform.all;
      if (!acc[platform])
        acc[platform] = { count: 0, clicks: 0, impressions: 0 };
      acc[platform].count++;
      acc[platform].clicks += a.clickCount || 0;
      acc[platform].impressions += a.impressionCount || 0;
      return acc;
    }, {});

    return {
      totalAds,
      activeAds,
      inactiveAds: totalAds - activeAds,
      totalClicks,
      totalImpressions,
      avgCTR: parseFloat(avgCTR),
      byPosition,
      byPlatform,
    };
  }

  /**
   * Get single ad by ID (admin)
   */
  async findOne(id: string) {
    const ad = await this.adRepo.findUnique({
      where: { id },
      include: ADMIN_AD_INCLUDE,
    });
    if (!ad)
      throw new NotFoundException(i18nMessage("server.advertisement.notFound"));
    return this.toResponse(ad);
  }

  /**
   * Create ad (admin).
   */
  async create(dto: CreateAdvertisementDto) {
    // Check IAB compliance if dimensions provided
    if (dto.width && dto.height) {
      const compliance = this.checkIABCompliance(dto.width, dto.height);
      if (!compliance.isCompliant) {
        this.logger.warn("Ad dimensions not IAB compliant");
      }
    }
    const startDate = toDateField(dto.startDate) ?? null;
    const endDate = toDateField(dto.endDate) ?? null;
    this.assertWindowOrder(startDate, endDate);
    // Yeni reklamın "kayıtlı hali" görselsizdir; kurallar güncellemeyle aynı.
    const targets = resolveAdClickTargets({ imageUrl: null }, dto);
    await this.assertDiscountExists(dto.discountId);
    // Varsayılanların tek yeri burası (DTO'da alan başlangıç değeri yok —
    // bkz. CreateAdvertisementDto).
    const position = dto.position ?? AdPosition.header;
    const platform = dto.platform ?? ContentPlatform.all;
    const isActive = dto.isActive ?? true;
    await this.assertSlotFree({
      position,
      platform,
      isActive,
      startDate,
      endDate,
    });

    const hotspots =
      targets.hotspots.kind === "replace" ? targets.hotspots.hotspots : [];
    const ad = await this.adRepo.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl ?? null,
        linkUrl: targets.linkUrl ?? null,
        content: dto.content ?? null,
        altText: dto.altText ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
        position,
        platform,
        deviceType: adDeviceTypeFor(platform),
        popupFrequency: dto.popupFrequency ?? AdPopupFrequency.until_dismissed,
        displayOrder: dto.displayOrder ?? 0,
        isActive,
        startDate,
        endDate,
        // Kampanya bağı: şeritteki kupon kodu + flaş geri sayım ve "kampanya
        // bitince afiş düşer" süzmesi bu kolondan okunur. Alan DTO'da vardı
        // ama persist edilmiyordu — bağ hiç kurulamıyordu.
        discountId: dto.discountId || null,
        // İç içe oluşturma reklamla tek işlemdedir.
        hotspots: hotspots.length
          ? {
              create: hotspots.map((hotspot, index) =>
                adHotspotRowData(hotspot, index),
              ),
            }
          : undefined,
      },
      include: ADMIN_AD_INCLUDE,
    });
    return this.toResponse(ad);
  }

  /**
   * Update ad (admin). Alan yok (`undefined`) = dokunma; `null` = temizle.
   * Zorunlu alanlara `null` DTO'da reddedilir (UpdateAdvertisementDto).
   */
  async update(id: string, dto: UpdateAdvertisementDto) {
    const existing = await this.adRepo.findUnique({
      where: { id },
      include: { hotspots: { select: { id: true } } },
    });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.advertisement.notFound"));

    // Check IAB compliance if dimensions changed
    const newWidth = dto.width !== undefined ? dto.width : existing.width;
    const newHeight = dto.height !== undefined ? dto.height : existing.height;
    if (
      newWidth &&
      newHeight &&
      (dto.width !== undefined || dto.height !== undefined)
    ) {
      const compliance = this.checkIABCompliance(newWidth, newHeight);
      if (!compliance.isCompliant) {
        this.logger.warn("Ad dimensions not IAB compliant");
      }
    }

    // Tek uç değişse de sıra, saklı öbür uçla birlikte doğrulanır.
    const startDate = toDateField(dto.startDate);
    const endDate = toDateField(dto.endDate);
    const slot: AdSlotCandidate = {
      position: dto.position ?? existing.position,
      platform: dto.platform ?? existing.platform,
      isActive: dto.isActive ?? existing.isActive,
      startDate: startDate === undefined ? existing.startDate : startDate,
      endDate: endDate === undefined ? existing.endDate : endDate,
    };
    this.assertWindowOrder(slot.startDate, slot.endDate);
    // Yuvayı ilgilendiren alan değişmediyse kural sorulmaz: kural öncesinden
    // kalan çakışmalı bir reklamın yalnız başlığı/görseli düzeltilebilsin
    // (vitrinde zaten `firstAdPerPosition` tek reklam gösterir).
    if (slotChanged(existing, slot)) {
      await this.assertSlotFree(slot, id);
    }

    // Görsel/bağlantı/alan kuralları SONUÇ reklam üzerinde (saklı + yama).
    const targets = resolveAdClickTargets(existing, dto);

    if (dto.discountId) {
      await this.assertDiscountExists(dto.discountId);
    }

    // Alan kümesi ile reklam satırı tek işlemde: yarım kalan değişim görselle
    // uyuşmayan alanlar bırakmasın.
    const ad = await this.prisma.$transaction(async (tx) => {
      await this.applyHotspotChange(
        tx,
        id,
        existing.hotspots.map((h) => h.id),
        targets.hotspots,
      );
      return tx.advertisement.update({
        where: { id },
        // Prisma'da `undefined` alanı yazmaz, `null` temizler — DTO'nun
        // anlamı birebir taşınır.
        data: {
          title: dto.title,
          imageUrl: dto.imageUrl,
          // Görselli reklamda daima null; görselsizde DTO'nun anlamı.
          linkUrl: targets.linkUrl,
          content: dto.content,
          altText: dto.altText,
          width: dto.width,
          height: dto.height,
          position: dto.position,
          platform: dto.platform,
          deviceType: dto.platform ? adDeviceTypeFor(dto.platform) : undefined,
          popupFrequency: dto.popupFrequency,
          // Her admin güncellemesi yeni sürümdür: kapatılmış popup yeniden
          // açılır. Tık/gösterim sayaçları bu yoldan geçmez, artırmaz.
          popupVersion: { increment: 1 },
          displayOrder: dto.displayOrder,
          isActive: dto.isActive,
          startDate,
          endDate,
          // undefined = dokunma; null ya da boş dize = bağı kaldır (SetNull).
          discountId:
            dto.discountId === undefined ? undefined : dto.discountId || null,
        },
        include: ADMIN_AD_INCLUDE,
      });
    });
    return this.toResponse(ad);
  }

  /**
   * Alan değişimini işlem içinde uygular. Kalan alanlar yerinde güncellenir
   * (tık sayacı korunur), listede olmayanlar silinir, yeniler eklenir; sıra
   * payload dizisinin sırasıdır.
   */
  private async applyHotspotChange(
    tx: Prisma.TransactionClient,
    advertisementId: string,
    persistedIds: string[],
    change: AdHotspotChange,
  ): Promise<void> {
    if (change.kind === "keep") return;
    if (change.kind === "clear") {
      await tx.adHotspot.deleteMany({ where: { advertisementId } });
      return;
    }
    const plan = planAdHotspotReplace(persistedIds, change.hotspots);
    await tx.adHotspot.deleteMany({
      where: { advertisementId, id: { notIn: plan.keepIds } },
    });
    for (const { id, data } of plan.update) {
      await tx.adHotspot.update({ where: { id }, data });
    }
    if (plan.create.length) {
      await tx.adHotspot.createMany({
        data: plan.create.map((row) => ({ ...row, advertisementId })),
      });
    }
  }

  /**
   * Bir yuvada (pozisyon × platform) aynı anda tek aktif reklam: çakışan
   * varsa 409, mesaj çakışan reklamın başlığını verir. Kural
   * `adSlotConflictWhere`'dadır.
   */
  private async assertSlotFree(candidate: AdSlotCandidate, excludeId?: string) {
    const where = adSlotConflictWhere(candidate, new Date(), excludeId);
    if (!where) return;
    const taken = await this.adRepo.findFirst({
      where,
      select: { title: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    });
    if (taken) {
      throw new ConflictException(
        i18nMessage("server.ads.slotTaken", { title: taken.title }),
      );
    }
  }

  /** Yayın penceresi ters olamaz: böyle bir reklam hiçbir an yayında olmaz. */
  private assertWindowOrder(start: Date | null, end: Date | null) {
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        i18nMessage("server.advertisement.endBeforeStart"),
      );
    }
  }

  /** Kampanya bağı doğrulaması: var olmayan kampanyaya bağlanan afiş, süzme
   *  tarafında sessizce görünmez olurdu — tanım anında net hata ver. */
  private async assertDiscountExists(discountId?: string | null) {
    if (!discountId) return;
    const discount = await this.prisma.discount.findUnique({
      where: { id: discountId },
      select: { id: true },
    });
    if (!discount) {
      throw new NotFoundException(
        i18nMessage("server.advertisement.campaignNotFound"),
      );
    }
  }

  /**
   * Delete ad (admin).
   */
  async remove(id: string) {
    const existing = await this.adRepo.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(i18nMessage("server.advertisement.notFound"));
    await this.adRepo.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Reorder ads (admin).
   */
  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id: string, index: number) =>
        this.adRepo.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    return this.findAll();
  }

  private toResponse(ad: AdminAdRow) {
    const ctr =
      ad.impressionCount > 0
        ? ((ad.clickCount / ad.impressionCount) * 100).toFixed(2)
        : "0.00";

    // Check IAB compliance
    const iabCompliance = this.checkIABCompliance(ad.width, ad.height);

    return {
      id: ad.id,
      title: ad.title,
      imageUrl: ad.imageUrl,
      linkUrl: ad.linkUrl,
      content: ad.content,
      altText: ad.altText,
      width: ad.width,
      height: ad.height,
      position: ad.position,
      platform: ad.platform,
      deviceType: adDeviceTypeFor(ad.platform),
      popupFrequency: ad.popupFrequency,
      popupVersion: ad.popupVersion,
      displayOrder: ad.displayOrder,
      isActive: ad.isActive,
      startDate: ad.startDate,
      endDate: ad.endDate,
      discountId: ad.discountId ?? null,
      discount: ad.discount
        ? {
            id: ad.discount.id,
            name: ad.discount.name,
            isActive: ad.discount.isActive,
            startDate: ad.discount.startDate,
            endDate: ad.discount.endDate,
          }
        : null,
      // Alan başına `clickCount` dahil, sortOrder sırasıyla.
      hotspots: ad.hotspots,
      clickCount: ad.clickCount,
      impressionCount: ad.impressionCount,
      ctr: parseFloat(ctr),
      iabCompliant: iabCompliance.isCompliant,
      iabSize: iabCompliance.matchedSize,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    };
  }
}
