import { ProductKind, ProductStatus } from "@prisma/client";
import { BoostAudienceService } from "../boost-seller/boost-audience.service";
import { ProductBoostService } from "./product-boost.service";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type OrderBy = Record<
  string,
  "asc" | "desc" | { sort: "asc" | "desc"; nulls?: "first" | "last" }
>;

/** A Prisma `where` of the shapes the tier lookups send, in memory. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      return (condition as Where[]).some((branch) => matches(row, branch));
    }
    const value = row[key];
    if (condition === null) return value === null;
    if (typeof condition === "object") {
      if (value == null) return false;
      return Object.entries(condition as Record<string, unknown>).every(
        ([op, bound]) => {
          const v = Number(value);
          const b = Number(bound);
          if (op === "lte") return v <= b;
          if (op === "lt") return v < b;
          if (op === "gte") return v >= b;
          if (op === "gt") return v > b;
          throw new Error(`fake where: unsupported operator ${op}`);
        },
      );
    }
    return value === condition;
  });
}

/** A Prisma `orderBy` list in memory (PostgreSQL: nulls last ascending). */
function ordered(rows: Row[], orderBy: OrderBy | OrderBy[] | undefined): Row[] {
  const keys = orderBy === undefined ? [] : [orderBy].flat();
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      const [field, spec] = Object.entries(key)[0];
      const sort = typeof spec === "string" ? spec : spec.sort;
      const nulls =
        typeof spec === "string" || !spec.nulls
          ? sort === "asc"
            ? "last"
            : "first"
          : spec.nulls;
      const x = a[field];
      const y = b[field];
      if (x == null || y == null) {
        if (x == null && y == null) continue;
        return (x == null) === (nulls === "first") ? -1 : 1;
      }
      const cmp =
        typeof x === "string" && typeof y === "string"
          ? x < y
            ? -1
            : x > y
              ? 1
              : 0
          : Number(x) - Number(y);
      if (cmp !== 0) return sort === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

const PKG = {
  id: "pkg-1",
  name: "Ekonomik",
  slug: "ekonomik",
  showcaseOnHome: false,
};

const at = (day: number) => new Date(Date.UTC(2026, 6, day));
const tier = (
  id: string,
  durationDays: number,
  minAmount: number,
  maxAmount: number | null,
  price: number,
  over: Row = {},
): Row => ({
  id,
  packageId: PKG.id,
  durationDays,
  minAmount,
  maxAmount,
  price,
  campaignPrice: null,
  campaignStartsAt: null,
  campaignEndsAt: null,
  isActive: true,
  createdAt: at(1),
  ...over,
});

/**
 * Tiers saved before the overlap check: the launch bands plus legacy rows
 * that overlap them. The save refuses such rows now; the lookups still have
 * to pick one tier per duration deterministically, and the same one.
 */
const TIERS: Row[] = [
  tier("t-launch-1", 7, 200, 999, 150),
  tier("t-launch-2", 7, 1000, 5000, 250),
  tier("t-launch-3", 7, 5000, null, 500),
  tier("t-catch-all", 7, 0, null, 99, { createdAt: at(0) }),
  tier("t-overlap", 7, 4000, 6000, 300),
  tier("t-narrow", 7, 5000, 7000, 450),
  tier("t-twin-b", 30, 1000, 5000, 760, { createdAt: at(2) }),
  tier("t-twin-a", 30, 1000, 5000, 750, { createdAt: at(2) }),
  tier("t-newer-twin", 30, 1000, 5000, 740, { createdAt: at(3) }),
  tier("t-inactive", 7, 0, null, 1, { isActive: false }),
];

function harness(listingPrice: number) {
  const prisma = {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    userMembership: { findUnique: jest.fn().mockResolvedValue(null) },
    product: {
      findFirst: jest.fn().mockResolvedValue({
        id: "listing-1",
        sellerId: "seller-1",
        status: ProductStatus.active,
        kind: ProductKind.listing,
        price: listingPrice,
        oldPrice: null,
      }),
    },
    adPackage: {
      findFirst: jest.fn().mockResolvedValue(PKG),
      findMany: jest.fn(
        ({
          include,
        }: {
          include: { tiers: { where: Where; orderBy: OrderBy[] } };
        }) =>
          Promise.resolve([
            {
              ...PKG,
              tiers: ordered(
                TIERS.filter((row) => matches(row, include.tiers.where)),
                include.tiers.orderBy,
              ),
            },
          ]),
      ),
    },
    adPackageTier: {
      findFirst: jest.fn(
        ({ where, orderBy }: { where: Where; orderBy: OrderBy[] }) =>
          Promise.resolve(
            ordered(
              TIERS.filter((row) => matches(row, where)),
              orderBy,
            )[0] ?? null,
          ),
      ),
    },
  };
  const service = new ProductBoostService(
    prisma as never,
    {} as never,
    {} as never,
    new BoostAudienceService(prisma as never),
  );
  const resolve = (durationDays: number) =>
    (
      service as unknown as {
        resolvePackagePrice(
          packageId: string,
          durationDays: number,
          productPrice: number,
          userId: string,
        ): Promise<{ price: number }>;
      }
    ).resolvePackagePrice(PKG.id, durationDays, listingPrice, "seller-1");
  const options = async () => {
    const response = await service.getBoostOptions("listing-1", "seller-1");
    return response.packages.flatMap((p) => p.options);
  };
  return { prisma, resolve, options };
}

/**
 * The options call and the purchase start resolve the same tier for the same
 * listing price (money): what the dialog shows as `price` is what initiate
 * compares `expectedPrice` with, so a seller never gets a 409 on every retry
 * because the two picked different overlapping tiers.
 */
describe("ProductBoostService — options and purchase start agree on the tier", () => {
  it.each([
    // [listing price, 7-day price, 30-day price or null]
    [0, 99, null], // the catch-all only
    [200, 150, null], // exact lower bound of 200-999
    [999, 99, null], // exact upper bound of 200-999 is outside it
    [1000, 250, 750], // exact lower bound; 30-day twins: older row, then id
    [3999.99, 250, 750],
    [4000, 300, 750], // highest lower bound wins over 1000-5000
    [4999.99, 300, 750],
    [5000, 450, null], // 5000 is outside 1000-5000; narrower of two 5000 bands
    [6999.99, 450, null],
    [7000, 500, null], // above the narrow band: the open launch band
    [1_000_000, 500, null], // far above the top open-ended band
  ])(
    "at %p TL the 7-day price is %p and the 30-day price %p",
    async (listingPrice, sevenDay, thirtyDay) => {
      const h = harness(listingPrice);

      const shown = await h.options();

      // One option per duration, in duration order.
      expect(shown.map((o) => o.durationDays)).toEqual(
        thirtyDay === null ? [7] : [7, 30],
      );
      expect(shown.find((o) => o.durationDays === 7)?.price).toBe(sevenDay);
      expect(shown.find((o) => o.durationDays === 30)?.price).toBe(
        thirtyDay ?? undefined,
      );
      // The purchase start resolves the price the dialog showed.
      for (const option of shown) {
        expect((await h.resolve(option.durationDays)).price).toBe(option.price);
      }
      if (thirtyDay === null) {
        await expect(h.resolve(30)).rejects.toMatchObject({
          status: 400,
          response: { i18nKey: "server.product.boostPriceUndefined" },
        });
      }
    },
  );

  it("sends both lookups the same band filter and precedence", async () => {
    const h = harness(5000);

    await h.options();
    await h.resolve(7);

    const [optionsArgs] = h.prisma.adPackage.findMany.mock.calls[0] as [
      { include: { tiers: { where: Where; orderBy: OrderBy[] } } },
    ];
    const [initiateArgs] = h.prisma.adPackageTier.findFirst.mock.calls[0] as [
      { where: Where; orderBy: OrderBy[] },
    ];
    const { packageId, durationDays, ...initiateBand } = initiateArgs.where;
    expect(packageId).toBe(PKG.id);
    expect(durationDays).toBe(7);
    expect(initiateBand).toEqual(optionsArgs.include.tiers.where);
    expect(optionsArgs.include.tiers.orderBy).toEqual([
      { durationDays: "asc" },
      ...initiateArgs.orderBy,
    ]);
  });
});
