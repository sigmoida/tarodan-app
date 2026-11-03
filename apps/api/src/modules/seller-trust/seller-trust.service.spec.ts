import { SELLER_TRUST_FORMULA_VERSION } from "@tarodan/types";
import { SellerTrustService, storedFilterWhere } from "./seller-trust.service";

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

/**
 * The admin lab's reads (plan 2026-11-03): always on the caller's read-only
 * snapshot (`tx`), never on the root client, and filtered by the same level
 * thresholds as `sellerTrustLevel`.
 */
describe("SellerTrustService lab reads", () => {
  const make = () => {
    const tx = {
      sellerTrustScore: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    // The root client has no table at all: a read there would throw.
    const service = new SellerTrustService({} as never);
    return { tx, txc: tx as never, service };
  };
  const select = {
    userId: true,
    scoreX100: true,
    formulaVersion: true,
    components: true,
    computedAt: true,
  };

  it("readStoredRow is one primary-key lookup on the snapshot", async () => {
    const { tx, txc, service } = make();
    await service.readStoredRow(txc, "u1");
    expect(tx.sellerTrustScore.findUnique).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select,
    });
  });

  it("readStoredPage pages in primary-key order after the last id", async () => {
    const { tx, txc, service } = make();
    await service.readStoredPage(txc, {}, null, 2000);
    await service.readStoredPage(txc, {}, "u9", 2000);
    expect(tx.sellerTrustScore.findMany.mock.calls).toEqual([
      [{ where: {}, orderBy: { userId: "asc" }, take: 2000, select }],
      [
        {
          where: { AND: [{}, { userId: { gt: "u9" } }] },
          orderBy: { userId: "asc" },
          take: 2000,
          select,
        },
      ],
    ]);
  });

  it("countStored counts with the same filter as the pages", async () => {
    const { tx, txc, service } = make();
    await service.countStored(txc, { minTransactions: 5 });
    expect(tx.sellerTrustScore.count).toHaveBeenCalledWith({
      where: storedFilterWhere({ minTransactions: 5 }),
    });
  });

  it("filters levels by the shared thresholds and transactions by the stored breakdown", () => {
    expect(
      storedFilterWhere({
        levels: ["excellent", "trusted", "fair", "developing", "new", "new"],
        minTransactions: 10,
      }),
    ).toEqual({
      AND: [
        {
          OR: [
            { scoreX100: { gte: 450 } },
            { scoreX100: { gte: 400, lt: 450 } },
            { scoreX100: { gte: 300, lt: 400 } },
            { scoreX100: { lt: 300 } },
            { scoreX100: null },
          ],
        },
        { components: { path: ["volume", "transactions"], gte: 10 } },
      ],
    });
    expect(storedFilterWhere({})).toEqual({});
    expect(storedFilterWhere({ levels: [] })).toEqual({});
  });
});
