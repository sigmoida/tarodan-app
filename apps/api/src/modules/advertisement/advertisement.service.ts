import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreateAdvertisementDto, AdPosition, AdDeviceType, IAB_STANDARD_SIZES } from './dto/create-advertisement.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';

/** Prisma client may not have Advertisement until after prisma generate + migration. */
type PrismaWithAd = PrismaService & {
  advertisement: {
    findMany: (args: any) => Promise<any[]>;
    findUnique: (args: any) => Promise<any | null>;
    findFirst: (args: any) => Promise<any | null>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
    delete: (args: any) => Promise<any>;
    count: (args: any) => Promise<number>;
  };
};

@Injectable()
export class AdvertisementService {
  constructor(private readonly prisma: PrismaService) {}

  private get adRepo(): PrismaWithAd['advertisement'] {
    return (this.prisma as PrismaWithAd).advertisement;
  }

  /**
   * Check if dimensions match IAB standard sizes
   */
  checkIABCompliance(width?: number, height?: number): { isCompliant: boolean; matchedSize?: string; suggestions: string[] } {
    if (!width || !height) {
      return { isCompliant: false, suggestions: IAB_STANDARD_SIZES.map(s => `${s.name}: ${s.width}x${s.height}`) };
    }

    const matched = IAB_STANDARD_SIZES.find(s => s.width === width && s.height === height);
    if (matched) {
      return { isCompliant: true, matchedSize: matched.name, suggestions: [] };
    }

    // Find closest sizes
    const suggestions = IAB_STANDARD_SIZES
      .map(s => ({
        ...s,
        diff: Math.abs(s.width - width) + Math.abs(s.height - height)
      }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 3)
      .map(s => `${s.name}: ${s.width}x${s.height}`);

    return { isCompliant: false, suggestions };
  }

  /**
   * Get active ads for display (public). Filters by isActive, startDate, endDate, position, deviceType.
   */
  async getActive(position?: string, deviceType?: string) {
    const now = new Date();
    
    // Base conditions for date filtering
    const dateConditions = [
      { startDate: null, endDate: null },
      { startDate: null, endDate: { gte: now } },
      { startDate: { lte: now }, endDate: null },
      { startDate: { lte: now }, endDate: { gte: now } },
    ];
    
    const where: any = {
      isActive: true,
      OR: dateConditions,
    };
    
    if (position) {
      where.position = position;
    }
    
    // Filter by device type - include 'all' type as well
    if (deviceType && deviceType !== 'all') {
      where.deviceType = { in: [deviceType, 'all'] };
    }
    
    const ads = await this.adRepo.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    
    return ads.map((a: any) => ({
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
    }));
  }

  /**
   * Record a click (public).
   */
  async recordClick(id: string) {
    const ad = await this.adRepo.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Reklam bulunamadı');
    await (this.prisma as PrismaWithAd).advertisement.update({
      where: { id },
      data: { clickCount: { increment: 1 } },
    });
    return { success: true };
  }

  /**
   * Record an impression (public).
   */
  async recordImpression(id: string) {
    const ad = await this.adRepo.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Reklam bulunamadı');
    await (this.prisma as PrismaWithAd).advertisement.update({
      where: { id },
      data: { impressionCount: { increment: 1 } },
    });
    return { success: true };
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
    const where: any = {};
    if (position) where.position = position;
    if (deviceType) where.deviceType = deviceType;
    if (typeof isActive === 'boolean') where.isActive = isActive;

    const ads = await this.adRepo.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    
    return ads.map((a: any) => this.toResponse(a));
  }

  /**
   * Get ad statistics summary
   */
  async getStatistics() {
    const ads = await this.adRepo.findMany({});
    
    const totalAds = ads.length;
    const activeAds = ads.filter((a: any) => a.isActive).length;
    const totalClicks = ads.reduce((sum: number, a: any) => sum + (a.clickCount || 0), 0);
    const totalImpressions = ads.reduce((sum: number, a: any) => sum + (a.impressionCount || 0), 0);
    const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    
    // Group by position
    const byPosition = ads.reduce((acc: any, a: any) => {
      const pos = a.position || 'header';
      if (!acc[pos]) acc[pos] = { count: 0, clicks: 0, impressions: 0 };
      acc[pos].count++;
      acc[pos].clicks += a.clickCount || 0;
      acc[pos].impressions += a.impressionCount || 0;
      return acc;
    }, {});

    // Group by device type
    const byDeviceType = ads.reduce((acc: any, a: any) => {
      const device = a.deviceType || 'all';
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
    const ad = await this.adRepo.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Reklam bulunamadı');
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
        // Just log warning, don't reject
        console.warn(`Ad "${dto.title}" dimensions (${dto.width}x${dto.height}) not IAB compliant. Suggestions: ${compliance.suggestions.join(', ')}`);
      }
    }

    const ad = await this.adRepo.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        content: dto.content,
        altText: dto.altText,
        width: dto.width,
        height: dto.height,
        position: dto.position ?? 'header',
        deviceType: dto.deviceType ?? 'all',
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    return this.toResponse(ad);
  }

  /**
   * Update ad (admin).
   */
  async update(id: string, dto: UpdateAdvertisementDto) {
    const existing = await this.adRepo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reklam bulunamadı');

    // Check IAB compliance if dimensions changed
    const newWidth = dto.width ?? existing.width;
    const newHeight = dto.height ?? existing.height;
    if (newWidth && newHeight && (dto.width !== undefined || dto.height !== undefined)) {
      const compliance = this.checkIABCompliance(newWidth, newHeight);
      if (!compliance.isCompliant) {
        console.warn(`Ad "${dto.title || existing.title}" dimensions (${newWidth}x${newHeight}) not IAB compliant.`);
      }
    }

    const ad = await (this.prisma as PrismaWithAd).advertisement.update({
      where: { id },
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
        startDate: dto.startDate != null ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate != null ? new Date(dto.endDate) : undefined,
      },
    });
    return this.toResponse(ad);
  }

  /**
   * Delete ad (admin).
   */
  async remove(id: string) {
    const existing = await this.adRepo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reklam bulunamadı');
    await (this.prisma as PrismaWithAd).advertisement.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Reorder ads (admin).
   */
  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id: string, index: number) =>
        (this.prisma as PrismaWithAd).advertisement.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    return this.findAll();
  }

  private toResponse(ad: any) {
    const ctr = ad.impressionCount > 0 
      ? ((ad.clickCount / ad.impressionCount) * 100).toFixed(2) 
      : '0.00';
    
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
