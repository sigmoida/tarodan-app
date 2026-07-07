import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { MembershipService } from '../membership/membership.service';
import { ProductStatus } from '@prisma/client';

/**
 * ProductStatsService — ilan sayacı ve satıcı istatistikleri (leaf; prisma +
 * membership). getActiveListingCount create tarafından da çağrılır → ProductCreateService
 * bunu enjekte eder (tek yön, asiklik).
 */
@Injectable()
export class ProductStatsService {
  private readonly logger = new Logger(ProductStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: MembershipService,
  ) { }

  /**
   * Get active listing count for a seller
   * Active listings include: pending, active, reserved statuses
   */
  async getActiveListingCount(sellerId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        sellerId,
        status: { in: [ProductStatus.active, ProductStatus.pending, ProductStatus.reserved] },
      },
    });
  }

  /**
   * Get product stats (views, likes) for seller dashboard
   */
  async getProductStats(productId: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        _count: {
          select: {
            likes: true,
            offers: true,
            orders: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }

    if (product.sellerId !== sellerId) {
      throw new ForbiddenException('Bu ürünün istatistiklerini görme yetkiniz yok');
    }

    return {
      id: product.id,
      title: product.title,
      viewCount: product.viewCount,
      likeCount: product.likeCount,
      offersCount: product._count.offers,
      ordersCount: product._count.orders,
    };
  }

  /**
   * Get detailed listing statistics for a seller
   * Returns counts by status and membership limit info
   */
  async getSellerListingStats(sellerId: string) {
    try {
      if (!sellerId) {
        throw new BadRequestException('Satıcı kimliği bulunamadı');
      }

      // Get all listing counts by status (exclude inactive, draft, deleted)
      const [pending, active, reserved, sold, rejected, inactive, deleted, total, all] = await Promise.all([
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.pending } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.active } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.reserved } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.sold } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.rejected } }),
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.inactive } }),
        // Kaldırılan (yönetici/satıcı silmesi) — ayrı sayaç.
        this.prisma.product.count({ where: { sellerId, status: ProductStatus.deleted } }),
        // Total should exclude inactive and deleted listings (limit/usage card uses this)
        this.prisma.product.count({
          where: {
            sellerId,
            status: { notIn: [ProductStatus.inactive, ProductStatus.deleted] }
          }
        }),
        // "Tümü" sayacı: deleted hariç (inactive DAHİL). Liste "Tümü"
        // filtresi (findSellerProducts: notIn[deleted]) ile birebir.
        this.prisma.product.count({
          where: {
            sellerId,
            status: { notIn: [ProductStatus.deleted] }
          }
        }),
      ]);

      // Active listings = pending + active + reserved (counts against limit)
      const activeListings = pending + active + reserved;

      // Get membership limits
      const limits = await this.membershipService.getUserLimits(sellerId);

      // İlan hakkı = maxTotalListings (tüm tier'lar için). Gösterim = uygulama:
      // canCreateListing zaten remainingTotalListings'e dayanıyor, bu yüzden
      // gösterilen "X/Y" ile engelleme aynı sayıyı kullanır. (free=10)
      const maxLimit = limits.maxTotalListings;
      const remainingLimit = limits.remainingTotalListings;

      return {
        // Counts by status
        counts: {
          pending,
          active,
          reserved,
          sold,
          rejected,
          inactive,
          deleted, // Kaldırılan (yönetici/satıcı silmesi) — ayrı state
          total, // Total excluding inactive, draft and deleted
          all, // "Tümü": draft ve deleted hariç (inactive dahil) — liste 'Tümü' ile aynı
          activeListings, // This counts against the limit
        },
        // Membership limits
        limits: {
          tierName: limits.tierName,
          tierType: limits.tierType,
          maxFreeListings: limits.maxFreeListings,       // Tier's total max free listings
          maxTotalListings: limits.maxTotalListings,     // Tier's total max listings
          remainingFreeListings: limits.remainingFreeListings,
          remainingTotalListings: limits.remainingTotalListings,
          maxImagesPerListing: limits.maxImages,
          canCreateListing: limits.canCreateListing,
          canUseFreeSlot: limits.canUseFreeSlot,
          canTrade: limits.canTrade,
          canCreateCollection: limits.canCreateCollection,
        },
        // Quick summary for UI
        summary: {
          used: activeListings,
          max: maxLimit,                  // Use maxFreeListings for free tier, maxTotalListings for others
          remaining: remainingLimit,
          canCreate: limits.canCreateListing,
          percentUsed: maxLimit > 0
            ? Math.round((activeListings / maxLimit) * 100)
            : 0,
        },
      };
    } catch (error) {
      this.logger.error(`Error in getSellerListingStats for sellerId ${sellerId}:`, error);
      if (error instanceof BadRequestException || error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`İlan istatistikleri alınamadı: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}
