/**
 * Sets the launch saved-search limits on the existing membership tiers:
 * basic 10, premium 20, business 50 (free keeps 5).
 *
 * Migration `20261021174800_saved_searches` only adds the column, with
 * DEFAULT 5 on every tier (data backfills never go in a schema migration).
 * Run this once after that deploy, dry run first.
 *
 * Idempotent: it changes only tiers still at the column default (5) whose
 * launch value differs (`planSavedSearchLimitUpdates`), so a re-run changes
 * nothing and any value other than 5 an admin has set stays. A paid tier an
 * admin deliberately set to 5 cannot be told apart from an untouched one:
 * run it right after the deploy, before admins edit the field. It writes
 * nothing unless `--apply` is given.
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

  const results = await prisma.$transaction(
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
  const updated = results.reduce((sum, result) => sum + result.count, 0);
  console.log(`Updated ${updated} of ${updates.length} planned tier(s).`);
  if (updated < updates.length) {
    console.log(
      "A tier changed since the read and was left alone; re-run the dry run.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
