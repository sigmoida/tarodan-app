import type { SellerTrustView } from "@tarodan/types";
import { ProductSchedulerService } from "./product-scheduler.service";
import {
  RELEVANCE_BOOST_BONUS,
  RELEVANCE_PREMIUM_BONUS,
  RELEVANCE_QUALITY_WEIGHT,
} from "../helpers/relevance-score";
import {
  rankingExecuteRaw,
  type RankingRow,
} from "../../../../test/test-utils/product-ranking-sql";

/**
 * Nightly `update-popularity` (03:00): the quality score reads the sellers'
 * stored trust ratings with ONE `getForUsers` call (decision D8, ADR 0014),
 * after `seller-trust-refresh` (02:30). No rating aggregate, no verified bonus.
 */
describe("ProductSchedulerService.runUpdatePopularityScores: trust rating", () => {
  const product = (id: string, sellerId: string) => ({
    id,
    viewCount: 0,
    likeCount: 0,
    description: null,
    sellerId,
    _count: { images: 2, orders: 0, likes: 0 },
  });

  const make = (trust: Map<string, SellerTrustView>) => {
    const rows = new Map<string, RankingRow>(
      ["p1", "p2", "p3"].map((id) => [id, { boostedUntil: null }]),
    );
    const prisma = {
      $executeRaw: rankingExecuteRaw(rows),
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            product("p1", "s1"),
            product("p2", "s1"),
            product("p3", "s2"),
          ]),
      },
      rating: { groupBy: jest.fn() },
      userMembership: { findMany: jest.fn().mockResolvedValue([]) },
      messageThread: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const sellerTrust = { getForUsers: jest.fn().mockResolvedValue(trust) };
    const service = new ProductSchedulerService(
      prisma as never,
      {} as never, // notifications
      {} as never, // scheduled queue
      {} as never, // cache
      {} as never, // search
      sellerTrust as never,
      {} as never, // boost timeline
      {} as never, // boost notices
    );
    return { service, prisma, sellerTrust, rows };
  };

  it("reads every seller's stored rating in one call and scores from it", async () => {
    const { service, prisma, sellerTrust, rows } = make(
      new Map<string, SellerTrustView>([
        ["s1", { rating: 4.37, level: "trusted", formulaVersion: 1 }],
        ["s2", { rating: null, level: "new", formulaVersion: 1 }],
      ]),
    );

    await service.runUpdatePopularityScores();

    expect(sellerTrust.getForUsers).toHaveBeenCalledTimes(1);
    expect(sellerTrust.getForUsers).toHaveBeenCalledWith(["s1", "s2"]);
    expect(prisma.rating.groupBy).not.toHaveBeenCalled();
    const quality = Object.fromEntries(
      [...rows].map(([id, row]) => [id, row.qualityScore]),
    );
    // 2 photos (10) + round(4.37 × 4) (17); a `new` seller earns no points.
    expect(quality).toEqual({ p1: 27, p2: 27, p3: 10 });
  });

  it("does not select the seller's verified flag", async () => {
    const { service, prisma } = make(new Map());

    await service.runUpdatePopularityScores();

    const select = prisma.product.findMany.mock.calls[0][0].select;
    expect(select.seller).toBeUndefined();
  });

  it("keeps the boosted tier and bonus of a boost activated after the read", async () => {
    // The nightly job reads every listing first and writes later. A boost
    // activated in between (here: while the job loads the memberships) must
    // not be written back as tier 0/1 without the boost bonus.
    const { service, prisma, rows } = make(new Map());
    prisma.userMembership.findMany.mockImplementation(async () => {
      rows.get("p1")!.boostedUntil = new Date(Date.now() + 7 * 864e5);
      return [{ userId: "s2" }];
    });

    await service.runUpdatePopularityScores();

    const quality = 2 * 5; // 2 photos, no description, no rating
    expect(rows.get("p1")).toMatchObject({
      rankTier: 2,
      relevanceScore:
        RELEVANCE_BOOST_BONUS + quality * RELEVANCE_QUALITY_WEIGHT,
    });
    expect(rows.get("p2")).toMatchObject({
      rankTier: 0,
      relevanceScore: quality * RELEVANCE_QUALITY_WEIGHT,
    });
    // s2 is a paid member: tier 1 and the premium bonus.
    expect(rows.get("p3")).toMatchObject({
      rankTier: 1,
      relevanceScore:
        RELEVANCE_PREMIUM_BONUS + quality * RELEVANCE_QUALITY_WEIGHT,
    });
  });

  it("drops a listing whose boost ended to its unboosted tier", async () => {
    const { service, rows } = make(new Map());
    rows.get("p1")!.boostedUntil = new Date(Date.now() - 1000);

    await service.runUpdatePopularityScores();

    expect(rows.get("p1")?.rankTier).toBe(0);
  });
});
