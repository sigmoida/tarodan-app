import type { SellerTrustView } from "@tarodan/types";
import { ProductRankingService } from "./product-ranking.service";
import {
  RELEVANCE_BOOST_BONUS,
  RELEVANCE_QUALITY_WEIGHT,
} from "../helpers/relevance-score";
import {
  rankingExecuteRaw,
  type RankingRow,
} from "../../../../test/test-utils/product-ranking-sql";

/**
 * Listing ranking reads the seller's stored trust rating (decision D8, ADR
 * 0014): one primary-key lookup, no rating aggregate, no verified bonus.
 */
describe("ProductRankingService.recomputeProductRanking", () => {
  const make = (trust: SellerTrustView) => {
    const rows = new Map<string, RankingRow>([["p1", { boostedUntil: null }]]);
    const prisma = {
      $executeRaw: rankingExecuteRaw(rows),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: "p1",
          description: "x".repeat(200),
          sellerId: "seller-1",
          popularityScore: 7,
          _count: { images: 8 },
        }),
      },
      rating: { aggregate: jest.fn() },
      userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const sellerTrust = { getForUser: jest.fn().mockResolvedValue(trust) };
    const service = new ProductRankingService(
      prisma as never,
      sellerTrust as never,
    );
    return { service, prisma, sellerTrust, rows };
  };

  it("scores the rating part from the stored trust rating", async () => {
    const { service, prisma, sellerTrust, rows } = make({
      rating: 3.74,
      level: "fair",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    expect(sellerTrust.getForUser).toHaveBeenCalledWith("seller-1");
    expect(prisma.rating.aggregate).not.toHaveBeenCalled();
    // 8 photos (40) + long description (20) + round(3.74 × 4) (15)
    expect(rows.get("p1")).toMatchObject({
      qualityScore: 75,
      rankTier: 0,
      relevanceScore: 75 * RELEVANCE_QUALITY_WEIGHT + 7,
    });
  });

  it("gives a seller without a score no rating points", async () => {
    const { service, rows } = make({
      rating: null,
      level: "new",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    expect(rows.get("p1")?.qualityScore).toBe(60);
  });

  it("does not read the seller's verified flag", async () => {
    const { service, prisma, rows } = make({
      rating: 5,
      level: "excellent",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    const select = prisma.product.findUnique.mock.calls[0][0].select;
    expect(select.seller).toBeUndefined();
    expect(rows.get("p1")?.qualityScore).toBe(80);
  });

  it("keeps the boosted tier and bonus of a boost activated after the read", async () => {
    // recompute reads the listing, then the seller's trust and membership,
    // then writes. A boost activated in between keeps tier 2 and the bonus.
    const { service, prisma, rows } = make({
      rating: null,
      level: "new",
      formulaVersion: 1,
    });
    prisma.userMembership.findUnique.mockImplementation(async () => {
      rows.get("p1")!.boostedUntil = new Date(Date.now() + 7 * 864e5);
      return null;
    });

    await service.recomputeProductRanking("p1");

    expect(rows.get("p1")).toMatchObject({
      rankTier: 2,
      relevanceScore: RELEVANCE_BOOST_BONUS + 60 * RELEVANCE_QUALITY_WEIGHT + 7,
    });
  });

  it("never writes the popularity columns", async () => {
    const { service, rows } = make({
      rating: null,
      level: "new",
      formulaVersion: 1,
    });

    await service.recomputeProductRanking("p1");

    expect(rows.get("p1")?.popularityUpdatedAt).toBeUndefined();
  });
});
