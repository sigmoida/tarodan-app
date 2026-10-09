import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { AdDeviceType, AdPosition, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma";
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
import { i18nMessage } from "../i18n";

/** Pozisyon / cihaz başına sayaç özeti (istatistik ekranı). */
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
} as const satisfies Prisma.AdvertisementInclude;

type AdminAdRow = Prisma.AdvertisementGetPayload<{
  include: typeof ADMIN_AD_INCLUDE;
}>;

const AD_POSITIONS = new Set<string>(Object.values(AdPosition));
const AD_DEVICE_TYPES = new Set<string>(Object.values(AdDeviceType));

/** Güncelleme alanı: `undefined` = dokunma, `null` = temizle, değer = yaz. */
function toDateField(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

@Injectable()
export class AdvertisementService {
  private readonly logger = new Logger(AdvertisementService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * Yuvadaki TÜM yayında reklamlar (public), `displayOrder ASC, createdAt
   * DESC` sırasıyla — rotasyonu web yapar. "Yayında" kuralı `isAdLive`'dır;
   * veritabanı süzmesi (`adLiveWhere`) yalnız daraltır.
   */
  async getActive(position?: string, deviceType?: string) {
    // Bilinmeyen yuva/cihaz (ör. kaldırılan `sidebar`) hiçbir reklamla
    // eşleşmez; sorguyu Prisma'nın enum hatasına bırakmayız.
    if (position && !AD_POSITIONS.has(position)) return [];
    if (deviceType && !AD_DEVICE_TYPES.has(deviceType)) return [];

    try {
      const now = new Date();
      const where: Prisma.AdvertisementWhereInput = adLiveWhere(now);

      if (position) {
        where.position = position as AdPosition;
      }

      // Filter by device type - include 'all' type as well
      if (deviceType && deviceType !== AdDeviceType.all) {
        where.deviceType = {
          in: [deviceType as AdDeviceType, AdDeviceType.all],
        };
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
        },
      });

      return ads
        .filter((a) => isAdLive(a, now))
        .map((a) => ({
          id: a.id,
          title: a.title,
          imageUrl: a.imageUrl,
          linkUrl: a.linkUrl,
          content: a.content,
          altText: a.altText,
          width: a.width,
          height: a.height,
          position: a.position,
          deviceType: a.deviceType,
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
        }));
    } catch (err) {
      this.logger.warn(`getActive failed: ${err}`);
      return [];
    }
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
  async findAll(position?: string, deviceType?: string, isActive?: boolean) {
    const where: Prisma.AdvertisementWhereInput = {};
    if (position) where.position = position as AdPosition;
    if (deviceType) where.deviceType = deviceType as AdDeviceType;
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

    // Group by device type
    const byDeviceType = ads.reduce<Record<string, AdCounterBucket>>((acc, a) => {
      const device = a.deviceType || "all";
      if (!acc[device]) acc[device] = { count: 0, clicks: 0, impressions: 0 };
      acc[device].count++;
      acc[device].clicks += a.clickCount || 0;
      acc[device].impressions += a.impressionCount || 0;
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
      byDeviceType,
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
    await this.assertDiscountExists(dto.discountId);

    const ad = await this.adRepo.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl ?? null,
        linkUrl: dto.linkUrl ?? null,
        content: dto.content ?? null,
        altText: dto.altText ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
        // Varsayılanların tek yeri burası (DTO'da alan başlangıç değeri yok —
        // bkz. CreateAdvertisementDto).
        position: dto.position ?? AdPosition.header,
        deviceType: dto.deviceType ?? AdDeviceType.all,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        startDate,
        endDate,
        // Kampanya bağı: şeritteki kupon kodu + flaş geri sayım ve "kampanya
        // bitince afiş düşer" süzmesi bu kolondan okunur. Alan DTO'da vardı
        // ama persist edilmiyordu — bağ hiç kurulamıyordu.
        discountId: dto.discountId || null,
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
    const existing = await this.adRepo.findUnique({ where: { id } });
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
    this.assertWindowOrder(
      startDate === undefined ? existing.startDate : startDate,
      endDate === undefined ? existing.endDate : endDate,
    );

    if (dto.discountId) {
      await this.assertDiscountExists(dto.discountId);
    }

    const ad = await this.adRepo.update({
      where: { id },
      // Prisma'da `undefined` alanı yazmaz, `null` temizler — DTO'nun
      // anlamı birebir taşınır.
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        content: dto.content,
        altText: dto.altText,
        width: dto.width,
        height: dto.height,
        position: dto.position,
        deviceType: dto.deviceType,
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
    return this.toResponse(ad);
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
      deviceType: ad.deviceType,
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
