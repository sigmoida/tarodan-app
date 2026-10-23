import { Prisma } from "@prisma/client";
import {
  BOOST_TIER_PRECEDENCE,
  boostTierBandIsEmpty,
  boostTierBandsOverlap,
  boostTierCoversPrice,
  boostTierCoversPriceWhere,
  findBoostTierGaps,
  findBoostTierOverlaps,
  firstTierPerDuration,
} from "./boost-tier-band";

/** The SQL rule (`boostTierCoversPriceWhere`) evaluated in memory. */
function whereMatches(
  where: Prisma.AdPackageTierWhereInput,
  tier: { minAmount: number; maxAmount: number | null },
): boolean {
  const min = where.minAmount as { lte: number };
  const [noMax, aboveMax] = where.OR as [
    { maxAmount: null },
    { maxAmount: { gt: number } },
  ];
  expect(noMax).toEqual({ maxAmount: null });
  return (
    tier.minAmount <= min.lte &&
    (tier.maxAmount === null || tier.maxAmount > aboveMax.maxAmount.gt)
  );
}

/**
 * The ad package tier band (money): half-open `[minAmount, maxAmount)`, a
 * null upper bound open-ended. The options, the purchase start and the offer
 * read prices through it, so a boundary price lands in exactly one band.
 */
describe("boost tier band", () => {
  const band = (minAmount: number, maxAmount: number | null) => ({
    minAmount,
    maxAmount,
  });

  describe("covers a listing price", () => {
    it.each([
      ["exactly the lower bound", band(1000, 5000), 1000, true],
      ["between the bounds", band(1000, 5000), 2999.99, true],
      ["one kurus below the upper bound", band(1000, 5000), 4999.99, true],
      ["exactly the upper bound (outside)", band(1000, 5000), 5000, false],
      ["one kurus below the lower bound", band(1000, 5000), 999.99, false],
      ["the lower bound of an open band", band(5000, null), 5000, true],
      ["far above an open band", band(5000, null), 10_000_000, true],
      ["below an open band", band(5000, null), 4999.99, false],
      ["0 in a band from 0", band(0, 200), 0, true],
    ])("%s", (_label, tier, price, covered) => {
      expect(boostTierCoversPrice(tier, price)).toBe(covered);
      // The SQL filter and the in-memory rule agree on every boundary.
      expect(whereMatches(boostTierCoversPriceWhere(price), tier)).toBe(
        covered,
      );
    });

    it("reads Decimal bounds like numbers", () => {
      const tier = {
        minAmount: new Prisma.Decimal("1000.00"),
        maxAmount: new Prisma.Decimal("5000.00"),
      };
      expect(boostTierCoversPrice(tier, 4999.99)).toBe(true);
      expect(boostTierCoversPrice(tier, 5000)).toBe(false);
    });

    it("puts a price on a shared boundary in exactly one of two touching bands", () => {
      const lower = band(1000, 5000);
      const upper = band(5000, null);
      for (const price of [999.99, 1000, 4999.99, 5000, 5000.01]) {
        const hits = [lower, upper].filter((t) =>
          boostTierCoversPrice(t, price),
        );
        expect(hits.length).toBe(price < 1000 ? 0 : 1);
      }
    });
  });

  describe("overlap", () => {
    it.each([
      ["touching bands", band(1000, 5000), band(5000, null), false],
      ["separate bands", band(0, 999), band(1000, 5000), false],
      ["a shared kurus", band(1000, 5000.01), band(5000, null), true],
      ["one band inside the other", band(0, null), band(1000, 5000), true],
      ["identical bands", band(1000, 5000), band(1000, 5000), true],
      ["two open bands", band(0, null), band(9000, null), true],
    ])("%s", (_label, a, b, overlaps) => {
      expect(boostTierBandsOverlap(a, b)).toBe(overlaps);
      expect(boostTierBandsOverlap(b, a)).toBe(overlaps);
    });

    it("finds every overlapping pair of active tiers of one duration, by index", () => {
      const tiers = [
        { durationDays: 7, ...band(0, 1000) },
        { durationDays: 7, ...band(1000, 5000) },
        { durationDays: 30, ...band(500, 2000) }, // another duration
        { durationDays: 7, ...band(4000, null) },
        { durationDays: 7, ...band(0, null), isActive: false }, // inactive
        { durationDays: 7, ...band(4500, 4600) },
      ];
      expect(findBoostTierOverlaps(tiers)).toEqual([
        { first: 1, second: 3 },
        { first: 1, second: 5 },
        { first: 3, second: 5 },
      ]);
    });

    it.each([
      ["after", [band(0, null), band(1000, 1000)]],
      ["before", [band(1000, 1000), band(0, null)]],
    ])(
      "never pairs an empty band %s an open band, which covers no price",
      (_label, bands) => {
        expect(
          findBoostTierOverlaps(bands.map((b) => ({ durationDays: 7, ...b }))),
        ).toEqual([]);
      },
    );

    it("finds nothing in a tiling of touching bands", () => {
      expect(
        findBoostTierOverlaps([
          { durationDays: 7, ...band(200, 1000) },
          { durationDays: 7, ...band(1000, 5000) },
          { durationDays: 7, ...band(5000, null) },
          { durationDays: 30, ...band(200, 1000) },
        ]),
      ).toEqual([]);
    });
  });

  it.each([
    [band(1000, 1000), true],
    [band(1000, 999.99), true],
    [band(1000, 1000.01), false],
    [band(1000, null), false],
  ])("band %p is empty: %p", (tier, empty) => {
    expect(boostTierBandIsEmpty(tier)).toBe(empty);
  });

  it("reports the uncovered prices between the bands of a duration", () => {
    const gaps = findBoostTierGaps([
      // The launch data: 200-999 then 1000-5000 leaves [999, 1000) uncovered.
      { durationDays: 7, ...band(200, 999) },
      { durationDays: 7, ...band(1000, 5000) },
      { durationDays: 7, ...band(5000, null) },
      { durationDays: 30, ...band(0, 100) },
      { durationDays: 30, ...band(50, 300) }, // overlaps, extends the run
      { durationDays: 30, ...band(400, 500) },
      { durationDays: 30, ...band(0, null), isActive: false },
    ]);
    expect(
      gaps.map((gap) => [
        gap.durationDays,
        gap.from.toNumber(),
        gap.to.toNumber(),
      ]),
    ).toEqual([
      [7, 999, 1000],
      [30, 300, 400],
    ]);
  });

  describe("precedence", () => {
    it("orders the highest lower bound, then the narrower band, then age and id", () => {
      expect(BOOST_TIER_PRECEDENCE).toEqual([
        { minAmount: "desc" },
        { maxAmount: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
        { id: "asc" },
      ]);
    });

    it("keeps the first tier of each duration from ordered rows", () => {
      const ordered = [
        { id: "a", durationDays: 7 },
        { id: "b", durationDays: 7 },
        { id: "c", durationDays: 30 },
        { id: "d", durationDays: 30 },
      ];
      expect(firstTierPerDuration(ordered).map((t) => t.id)).toEqual([
        "a",
        "c",
      ]);
    });
  });
});
