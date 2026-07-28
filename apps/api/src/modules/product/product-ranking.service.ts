import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { isPremiumEntitled } from "../membership/membership.util";
import { computeQualityScore } from "./helpers/quality-score";
import { computeRelevanceScore } from "./helpers/relevance-score";

/**
 * ProductRankingService — İlan Kalite Skoru + rankTier + relevanceScore yeniden
 * hesaplama (leaf; yalnız prisma). create/update sonrası ve boost yollarında çağrılır;
 * bu yüzden ProductCreateService/ProductUpdateService bunu enjekte eder (tek yön,
 * asiklik). Public imza korunur (facade + create/update delege eder).
 */
@Injectable()
export class ProductRankingService {
  private readonly logger = new Logger(ProductRankingService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        seller: { select: { isVerified: true } },
        _count: { select: { images: true } },
      },
    });
    if (!product) return;

    // Satıcının onaylı ortalama güven puanı (0..5)
    let sellerRating: number | null = null;
    const ratingStats = await this.prisma.rating.aggregate({
      where: { receiverId: product.sellerId, status: "approved" },
      _avg: { score: true },
      _count: true,
    });
    if (ratingStats._count > 0 && ratingStats._avg?.score) {
      sellerRating = Number(ratingStats._avg.score);
    }

    const qualityScore = computeQualityScore({
      photoCount: product._count.images,
      description: product.description,
      sellerRating,
      isVerifiedSeller: product.seller?.isVerified ?? false,
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
