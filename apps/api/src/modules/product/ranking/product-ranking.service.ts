import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { isPremiumEntitled } from "../../membership/helpers/membership.util";
import { computeQualityScore } from "../helpers/quality-score";
import { computeRelevanceScore } from "../helpers/relevance-score";
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
   * İlan Kalite Skoru + rankTier'ı yeniden hesaplar ve Product'a yazar.
   * rankTier: aktif boost → 2, ücretli (free olmayan) üyeli satıcı → 1, standart → 0.
   * create/update sonrası ve boost aktivasyon/bitiş yollarında çağrılır.
   */
  async recomputeProductRanking(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        description: true,
        boostedUntil: true,
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

    // rankTier hesapla
    const now = new Date();
    const hasActiveBoost =
      product.boostedUntil != null && new Date(product.boostedUntil) > now;
    let rankTier = 0;
    if (hasActiveBoost) {
      rankTier = 2;
    } else {
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
      rankTier = isPremiumEntitled(membership, membership?.user) ? 1 : 0;
    }

    const relevanceScore = computeRelevanceScore({
      rankTier,
      qualityScore,
      popularityScore: product.popularityScore,
    });

    await this.prisma.product.update({
      where: { id: product.id },
      data: { qualityScore, rankTier, relevanceScore },
    });
  }
}
