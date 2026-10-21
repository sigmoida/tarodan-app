import type { SellerTrustView } from "@tarodan/types";
import { ProductRankingService } from "./product-ranking.service";
import { RELEVANCE_QUALITY_WEIGHT } from "../helpers/relevance-score";

/**
 * Listing ranking reads the seller's stored trust rating (decision D8, ADR
 * 0014): one primary-key lookup, no rating aggregate, no verified bonus.
 */
describe("ProductRankingService.recomputeProductRanking", () => {
  const make = (trust: SellerTrustView) => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: "p1",
          description: "x".repeat(200),
          boostedUntil: null,
          sellerId: "seller-1",
          popularityScore: 7,
          _count: { images: 8 },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      rating: { aggregate: jest.fn() },
      userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const sellerTrust = { getForUser: jest.fn().mockResolvedValue(trust) };
    const service = new ProductRankingService(
      prisma as never,
      sellerTrust as never,
    );
    return { service, prisma, sellerTrust };
  };

  it("scores the rating part from the stored trust rating", async () => {
    const { service, prisma, sellerTrust } = make({
      rating: 3.74,
      level: "fair",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    expect(sellerTrust.getForUser).toHaveBeenCalledWith("seller-1");
    expect(prisma.rating.aggregate).not.toHaveBeenCalled();
    // 8 photos (40) + long description (20) + round(3.74 × 4) (15)
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        qualityScore: 75,
        rankTier: 0,
        relevanceScore: 75 * RELEVANCE_QUALITY_WEIGHT + 7,
      },
    });
  });

  it("gives a seller without a score no rating points", async () => {
    const { service, prisma } = make({
      rating: null,
      level: "new",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    expect(prisma.product.update.mock.calls[0][0].data.qualityScore).toBe(60);
  });

  it("does not read the seller's verified flag", async () => {
    const { service, prisma } = make({
      rating: 5,
      level: "excellent",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    const select = prisma.product.findUnique.mock.calls[0][0].select;
    expect(select.seller).toBeUndefined();
    expect(prisma.product.update.mock.calls[0][0].data.qualityScore).toBe(80);
  });
});
