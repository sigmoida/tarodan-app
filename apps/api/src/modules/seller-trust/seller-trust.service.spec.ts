import { SELLER_TRUST_FORMULA_VERSION } from "@tarodan/types";
import { SellerTrustService } from "./seller-trust.service";

/**
 * Read side of `seller_trust_scores` (ADR 0014): every read is one query on
 * the primary key, and a missing row is a `new` seller.
 */
describe("SellerTrustService reads", () => {
  const make = () => {
    const prisma = {
      sellerTrustScore: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    return {
      prisma,
      service: new SellerTrustService(prisma as never),
    };
  };

  it("getForUser reads one row by primary key, selecting only the score", async () => {
    const { prisma, service } = make();
    prisma.sellerTrustScore.findUnique.mockResolvedValue({
      scoreX100: 437,
      formulaVersion: 1,
    });

    await expect(service.getForUser("u1")).resolves.toEqual({
      rating: 4.37,
      level: "trusted",
      formulaVersion: 1,
    });
    expect(prisma.sellerTrustScore.findUnique).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { scoreX100: true, formulaVersion: true },
    });
  });

  it("getForUser is `new` without a row", async () => {
    const { prisma, service } = make();
    prisma.sellerTrustScore.findUnique.mockResolvedValue(null);
    await expect(service.getForUser("u1")).resolves.toEqual({
      rating: null,
      level: "new",
      formulaVersion: SELLER_TRUST_FORMULA_VERSION,
    });
  });

  it("getForUsers runs one query for a deduplicated id list and fills every id", async () => {
    const { prisma, service } = make();
    prisma.sellerTrustScore.findMany.mockResolvedValue([
      { userId: "a", scoreX100: 485, formulaVersion: 1 },
      { userId: "b", scoreX100: null, formulaVersion: 1 },
    ]);

    const map = await service.getForUsers(["a", "b", "c", "a"]);

    expect(prisma.sellerTrustScore.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sellerTrustScore.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["a", "b", "c"] } },
      select: { userId: true, scoreX100: true, formulaVersion: true },
    });
    expect([...map.keys()]).toEqual(["a", "b", "c"]);
    expect(map.get("a")).toMatchObject({ rating: 4.85, level: "excellent" });
    expect(map.get("b")).toMatchObject({ rating: null, level: "new" });
    expect(map.get("c")).toMatchObject({ rating: null, level: "new" });
  });

  it("getForUsers does not query for an empty list", async () => {
    const { prisma, service } = make();
    await expect(service.getForUsers([])).resolves.toEqual(new Map());
    expect(prisma.sellerTrustScore.findMany).not.toHaveBeenCalled();
  });

  it("getAdminView adds the breakdown and the run time", async () => {
    const { prisma, service } = make();
    const components = {
      version: 1,
      rating: { raters: 0, smoothed: 4, subScore: 0.75 },
      reliability: { eligibleOrders: 1, failures: 0, subScore: 0.9 },
      onTime: { shipped: 1, late: 0, subScore: 0.9 },
      volume: { transactions: 1, counterparties: 1, subScore: 0.15 },
      tenure: { days: 10, subScore: 0.01 },
    };
    prisma.sellerTrustScore.findUnique.mockResolvedValue({
      scoreX100: null,
      formulaVersion: 1,
      components,
      computedAt: new Date("2026-10-21T23:30:00.000Z"),
    });

    await expect(service.getAdminView("u1")).resolves.toEqual({
      rating: null,
      level: "new",
      formulaVersion: 1,
      components,
      computedAt: "2026-10-21T23:30:00.000Z",
    });
    expect(prisma.sellerTrustScore.findUnique).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: {
        scoreX100: true,
        formulaVersion: true,
        components: true,
        computedAt: true,
      },
    });
  });
});
