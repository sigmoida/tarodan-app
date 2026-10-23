import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import { computeQualityScore } from "../helpers/quality-score";
import { writeProductRanking } from "../helpers/product-ranking-write";
import { SellerTrustService } from "../../seller-trust";

/**
 * ProductRankingService: recomputes the listing quality score, rankTier and
 * relevanceScore. A leaf (Prisma and the stored seller trust score). Called
 * after create/update and on the boost paths, so ProductCreateService and
 * ProductUpdateService inject it (one direction, acyclic). The public
 * signature is kept (the facade and create/update delegate to it).
 */
@Injectable()
export class ProductRankingService {
  private readonly logger = new Logger(ProductRankingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerTrust: SellerTrustService,
  ) {}

  /**
   * Recomputes the listing quality score, rankTier and relevanceScore and
   * writes them. rankTier: running boost 2, paid (non-free) member seller 1,
   * else 0. Called after create and update and on the boost paths. The boosted
   * tier is decided by the row at write time (`writeProductRanking`), so a
   * boost activated meanwhile is never under-ranked.
   */
  async recomputeProductRanking(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        description: true,
        sellerId: true,
        popularityScore: true,
        _count: { select: { images: true } },
      },
    });
    if (!product) return;

    // The seller's stored trust rating (one primary-key lookup, ADR 0014).
    const trust = await this.sellerTrust.getForUser(product.sellerId);

    const qualityScore = computeQualityScore({
      photoCount: product._count.images,
      description: product.description,
      sellerTrustRating: trust.rating,
    });

    // The tier if the listing is not boosted when the write lands.
    const membership = await this.prisma.userMembership.findUnique({
      where: { userId: product.sellerId },
      select: {
        status: true,
        currentPeriodEnd: true,
        tier: { select: { type: true, isActive: true } },
        user: {
          select: {
            businessStatus: true,
            companyName: true,
            taxId: true,
          },
        },
      },
    });

    await writeProductRanking(this.prisma, {
      productId: product.id,
      qualityScore,
      popularityScore: product.popularityScore,
      unboostedTier: isPremiumEntitled(membership, membership?.user) ? 1 : 0,
      writePopularity: false,
      now: new Date(),
    });
  }
}
