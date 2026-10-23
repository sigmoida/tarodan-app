import { Prisma } from "@prisma/client";

/**
 * The listing-price band of an ad package tier (`AdPackageTier`) and the one
 * rule every lookup and every admin save uses.
 *
 * A band is **half-open**: `minAmount <= price < maxAmount`, and a null
 * `maxAmount` has no upper bound. The lower bound is inside the band, the
 * upper bound is not, so 1000-5000 and 5000-(none) touch without overlapping
 * and a listing priced exactly 5000 is in the second band only. This is the
 * same rule as the commission bands (`commission-rule-guard.service.ts`).
 *
 * The price matched against the band is `boostTierBasePrice` of the listing.
 * The options, the purchase start (`ProductBoostService`) and the one-time
 * offer (`BoostOfferService`) read the band through this file only, so what
 * the dialog shows is what the purchase resolves.
 */

type Amount = Prisma.Decimal.Value;

export interface BoostTierBand {
  minAmount: Amount;
  /** Null or absent: no upper bound. */
  maxAmount?: Amount | null;
}

/** The tiers whose band covers a listing price (`boostTierCoversPrice` in SQL). */
export function boostTierCoversPriceWhere(
  price: number,
): Prisma.AdPackageTierWhereInput {
  return {
    minAmount: { lte: price },
    OR: [{ maxAmount: null }, { maxAmount: { gt: price } }],
  };
}

/** The same band rule in memory (`boostTierCoversPriceWhere`). */
export function boostTierCoversPrice(
  tier: BoostTierBand,
  price: Amount,
): boolean {
  const amount = new Prisma.Decimal(price);
  return (
    new Prisma.Decimal(tier.minAmount).lte(amount) &&
    (tier.maxAmount == null || new Prisma.Decimal(tier.maxAmount).gt(amount))
  );
}

/**
 * Which tier wins when more than one active tier of a package and duration
 * covers the price. An admin save refuses such an overlap
 * (`findBoostTierOverlaps`), so this only decides for rows saved before that
 * check: the band with the highest lower bound, then the narrower band, then
 * the older row, then the id. The database does the ordering, so the options
 * and the purchase start, which both read with it, always pick the same row.
 */
export const BOOST_TIER_PRECEDENCE = [
  { minAmount: "desc" },
  { maxAmount: { sort: "asc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.AdPackageTierOrderByWithRelationInput[];

/**
 * The winning tier of each duration, from tiers already ordered by duration
 * and then `BOOST_TIER_PRECEDENCE` (the first row of a duration wins).
 */
export function firstTierPerDuration<T extends { durationDays: number }>(
  ordered: T[],
): T[] {
  const seen = new Set<number>();
  return ordered.filter((tier) => {
    if (seen.has(tier.durationDays)) return false;
    seen.add(tier.durationDays);
    return true;
  });
}

/** Whether two bands share at least one price (half-open, null = no bound). */
export function boostTierBandsOverlap(
  a: BoostTierBand,
  b: BoostTierBand,
): boolean {
  const startsBeforeEndOf = (start: Amount, band: BoostTierBand) =>
    band.maxAmount == null ||
    new Prisma.Decimal(start).lt(new Prisma.Decimal(band.maxAmount));
  return startsBeforeEndOf(a.minAmount, b) && startsBeforeEndOf(b.minAmount, a);
}

/** Whether a band is empty or inverted (`maxAmount <= minAmount`). */
export function boostTierBandIsEmpty(band: BoostTierBand): boolean {
  return (
    band.maxAmount != null &&
    new Prisma.Decimal(band.maxAmount).lte(new Prisma.Decimal(band.minAmount))
  );
}

export interface BoostTierRow extends BoostTierBand {
  durationDays: number;
  /** Absent means active (the admin form's default). */
  isActive?: boolean;
}

/**
 * Every pair of active tiers of the same duration whose bands overlap, as
 * indexes into `tiers` (`first < second`), in input order. Inactive rows are
 * never matched, so they may keep any band; an empty band covers no price
 * (`boostTierBandIsEmpty`) and overlaps nothing.
 */
export function findBoostTierOverlaps(
  tiers: readonly BoostTierRow[],
): Array<{ first: number; second: number }> {
  const pairs: Array<{ first: number; second: number }> = [];
  for (let first = 0; first < tiers.length; first++) {
    const a = tiers[first];
    if (a.isActive === false || boostTierBandIsEmpty(a)) continue;
    for (let second = first + 1; second < tiers.length; second++) {
      const b = tiers[second];
      if (
        b.isActive === false ||
        b.durationDays !== a.durationDays ||
        boostTierBandIsEmpty(b)
      ) {
        continue;
      }
      if (boostTierBandsOverlap(a, b)) pairs.push({ first, second });
    }
  }
  return pairs;
}

/**
 * The prices no active tier of a duration covers between its lowest and its
 * highest band, per duration: `[from, to)` with `to` the next band's lower
 * bound. Below the lowest band is not a gap (a package may start at any
 * price). For reports only: a gap is allowed, but one left by the half-open
 * rule (999 then 1000) is usually a mistake.
 */
export function findBoostTierGaps(
  tiers: readonly BoostTierRow[],
): Array<{ durationDays: number; from: Prisma.Decimal; to: Prisma.Decimal }> {
  const byDuration = new Map<number, BoostTierRow[]>();
  for (const tier of tiers) {
    if (tier.isActive === false || boostTierBandIsEmpty(tier)) continue;
    byDuration.set(tier.durationDays, [
      ...(byDuration.get(tier.durationDays) ?? []),
      tier,
    ]);
  }
  const gaps: Array<{
    durationDays: number;
    from: Prisma.Decimal;
    to: Prisma.Decimal;
  }> = [];
  for (const [durationDays, rows] of [...byDuration].sort(
    ([a], [b]) => a - b,
  )) {
    const sorted = [...rows].sort((a, b) =>
      new Prisma.Decimal(a.minAmount).cmp(new Prisma.Decimal(b.minAmount)),
    );
    // The end of the covered run so far; null once a band has no upper bound.
    let coveredTo: Prisma.Decimal | null =
      sorted[0].maxAmount == null
        ? null
        : new Prisma.Decimal(sorted[0].maxAmount);
    for (const tier of sorted.slice(1)) {
      if (coveredTo == null) break;
      const start = new Prisma.Decimal(tier.minAmount);
      if (start.gt(coveredTo)) {
        gaps.push({ durationDays, from: coveredTo, to: start });
      }
      if (tier.maxAmount == null) {
        coveredTo = null;
      } else {
        const end = new Prisma.Decimal(tier.maxAmount);
        if (end.gt(coveredTo)) coveredTo = end;
      }
    }
  }
  return gaps;
}
