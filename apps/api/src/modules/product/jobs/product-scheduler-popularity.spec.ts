import type { SellerTrustView } from "@tarodan/types";
import { ProductSchedulerService } from "./product-scheduler.service";

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
    boostedUntil: null,
    sellerId,
    _count: { images: 2, orders: 0, likes: 0 },
  });

  const make = (trust: Map<string, SellerTrustView>) => {
    const prisma = {
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            product("p1", "s1"),
            product("p2", "s1"),
            product("p3", "s2"),
          ]),
        update: jest.fn().mockResolvedValue({}),
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
    );
    return { service, prisma, sellerTrust };
  };

  it("reads every seller's stored rating in one call and scores from it", async () => {
    const { service, prisma, sellerTrust } = make(
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
      prisma.product.update.mock.calls.map(([args]) => [
        args.where.id,
        args.data.qualityScore,
      ]),
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
});
