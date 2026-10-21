/**
 * Sets the launch saved-search limits on the existing membership tiers:
 * basic 10, premium 20, business 50 (free keeps 5).
 *
 * Migration `20261021174800_saved_searches` only adds the column, with
 * DEFAULT 5 on every tier (data backfills never go in a schema migration).
 * Run this once after that deploy, dry run first.
 *
 * Idempotent and admin-safe: it changes only tiers still at the column
 * default whose launch value differs (`planSavedSearchLimitUpdates`), so a
 * value an admin has changed is never overwritten and a re-run changes
 * nothing. It writes nothing unless `--apply` is given.
 *
 * Usage:
 *   node dist-seed/maintenance/set-saved-search-limits.js            # dry run
 *   node dist-seed/maintenance/set-saved-search-limits.js --apply
 */
import { PrismaClient } from "@prisma/client";
import {
  SAVED_SEARCH_LIMIT_COLUMN_DEFAULT,
  planSavedSearchLimitUpdates,
} from "../src/modules/saved-search/helpers/saved-search-tier-limits";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const tiers = await prisma.membershipTier.findMany({
    select: { type: true, maxSavedSearches: true },
    orderBy: { sortOrder: "asc" },
  });
  for (const tier of tiers) {
    console.log(`${tier.type}: maxSavedSearches=${tier.maxSavedSearches}`);
  }

  const updates = planSavedSearchLimitUpdates(tiers);
  if (updates.length === 0) {
    console.log("Nothing to change.");
    return;
  }
  for (const update of updates) {
    console.log(`Change ${update.type}: ${update.from} -> ${update.to}`);
  }

  if (!apply) {
    console.log("\n[DRY RUN] Nothing written. Re-run with --apply.");
    return;
  }

  await prisma.$transaction(
    updates.map((update) =>
      prisma.membershipTier.updateMany({
        // Compare-and-set: an admin edit between the read and this write wins.
        where: {
          type: update.type,
          maxSavedSearches: SAVED_SEARCH_LIMIT_COLUMN_DEFAULT,
        },
        data: { maxSavedSearches: update.to },
      }),
    ),
  );
  console.log(`Updated ${updates.length} tier(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
