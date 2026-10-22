/**
 * Read-only check of the ad package (boost) price tiers against the band
 * rule (`src/modules/product/helpers/boost-tier-band.ts`): a band is
 * half-open, `minAmount <= price < maxAmount`, null `maxAmount` open-ended.
 *
 * The admin save refuses overlapping active bands of one duration since the
 * fix; rows saved before it can still overlap. The lookups then pick one
 * tier deterministically (`BOOST_TIER_PRECEDENCE`), but the admin should fix
 * the rows so the price is the one they meant. Per package it prints:
 *
 * - `OVERLAP`: two active tiers of one duration that cover the same prices;
 * - `EMPTY`: a tier whose upper bound is not above its lower bound (it never
 *   matches a listing);
 * - `GAP`: prices between two bands of a duration that no active tier covers;
 * - `UPPER BOUND NOW OUTSIDE`: an active band's upper bound that no other
 *   active band of the duration covers. A listing priced exactly at it was
 *   matched before the half-open rule and is not any more (the launch rows
 *   200-999 then 1000-5000 leave 999 uncovered).
 *
 * It never writes: there is no `--apply`. Fix the rows in the admin panel
 * (Marketing -> Ad packages), which also refuses a save that still overlaps.
 *
 * Usage:
 *   node dist-seed/maintenance/check-ad-package-tiers.js
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  boostTierBandIsEmpty,
  boostTierCoversPrice,
  findBoostTierGaps,
  findBoostTierOverlaps,
} from "../src/modules/product/helpers/boost-tier-band";

const prisma = new PrismaClient();

type TierRow = {
  id: string;
  durationDays: number;
  minAmount: Prisma.Decimal;
  maxAmount: Prisma.Decimal | null;
  price: Prisma.Decimal;
  campaignPrice: Prisma.Decimal | null;
  isActive: boolean;
};

const band = (tier: Pick<TierRow, "minAmount" | "maxAmount">) =>
  `[${tier.minAmount.toFixed(2)}, ${tier.maxAmount?.toFixed(2) ?? "none"})`;

const describeTier = (tier: TierRow) =>
  `tier ${tier.id} ${band(tier)} price ${tier.price.toFixed(2)}` +
  (tier.campaignPrice ? ` campaign ${tier.campaignPrice.toFixed(2)}` : "") +
  (tier.isActive ? "" : " (inactive)");

/** The findings of one package, as report lines. */
function checkPackage(tiers: TierRow[]): string[] {
  const lines: string[] = [];
  for (const { first, second } of findBoostTierOverlaps(tiers)) {
    const a = tiers[first];
    const b = tiers[second];
    lines.push(
      `OVERLAP ${a.durationDays}d: ${describeTier(a)} and ${describeTier(b)}`,
    );
  }
  for (const tier of tiers) {
    if (boostTierBandIsEmpty(tier)) {
      lines.push(`EMPTY ${tier.durationDays}d: ${describeTier(tier)}`);
    }
  }
  for (const gap of findBoostTierGaps(tiers)) {
    lines.push(
      `GAP ${gap.durationDays}d: listing prices [${gap.from.toFixed(2)}, ${gap.to.toFixed(2)}) have no tier`,
    );
  }
  const active = tiers.filter((tier) => tier.isActive);
  for (const tier of active) {
    if (tier.maxAmount == null || boostTierBandIsEmpty(tier)) continue;
    const upper = tier.maxAmount;
    const stillCovered = active.some(
      (other) =>
        other.durationDays === tier.durationDays &&
        boostTierCoversPrice(other, upper),
    );
    if (!stillCovered) {
      lines.push(
        `UPPER BOUND NOW OUTSIDE ${tier.durationDays}d: a listing priced exactly ${upper.toFixed(2)} no longer matches ${describeTier(tier)} or any other tier`,
      );
    }
  }
  return lines;
}

async function main(): Promise<void> {
  const packages = await prisma.adPackage.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      isActive: true,
      tiers: {
        orderBy: [{ durationDays: "asc" }, { minAmount: "asc" }, { id: "asc" }],
        select: {
          id: true,
          durationDays: true,
          minAmount: true,
          maxAmount: true,
          price: true,
          campaignPrice: true,
          isActive: true,
        },
      },
    },
  });

  let packagesWithFindings = 0;
  for (const pkg of packages) {
    const lines = checkPackage(pkg.tiers);
    const status = pkg.isActive ? "active" : "inactive";
    console.log(
      `\n${pkg.slug} (${pkg.id}, ${status}, ${pkg.tiers.length} tiers): ${lines.length === 0 ? "OK" : `${lines.length} finding(s)`}`,
    );
    for (const line of lines) console.log(`  ${line}`);
    if (lines.length > 0) packagesWithFindings++;
  }

  console.log(
    `\n[READ ONLY] ${packages.length} package(s) checked, ${packagesWithFindings} with findings. Nothing written.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
