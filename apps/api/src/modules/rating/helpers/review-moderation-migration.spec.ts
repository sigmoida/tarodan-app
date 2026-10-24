import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * Pins the review moderation migration: additive only (the old image and the
 * live mobile app keep working during the deploy), the `hidden` status, and
 * moderator FKs that never delete or block a review. It must sort after the
 * payout hotfix migration, which may already be applied in production when
 * this one ships.
 */
const MIGRATION = "20261023140000_review_moderation_fields";
const HOTFIX_MIGRATION = "20261023120000_payout_submitted_total_amount";

const sql = readFileSync(
  join(apiAppRoot(), "prisma/migrations", MIGRATION, "migration.sql"),
  "utf8",
).replace(/--.*$/gm, "");

describe(`migration ${MIGRATION}`, () => {
  it("sorts after the payout hotfix migration", () => {
    expect([HOTFIX_MIGRATION, MIGRATION].sort()).toEqual([
      HOTFIX_MIGRATION,
      MIGRATION,
    ]);
  });

  it("is additive only: no drop, rename, NOT NULL or row update", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/NOT\s+NULL/i);
    expect(sql).not.toMatch(/\bUPDATE\s+"?(product_)?ratings"?\s+SET\b/i);
  });

  it("adds the hidden status without using it in the same migration", () => {
    expect(sql).toMatch(
      /ALTER TYPE "RatingStatus" ADD VALUE IF NOT EXISTS 'hidden';/,
    );
    expect(sql.match(/'hidden'/g)).toHaveLength(1);
  });

  it.each(["ratings", "product_ratings"])(
    "%s gets three nullable moderation columns and a SET NULL moderator FK",
    (table) => {
      for (const column of [
        '"moderation_reason" TEXT',
        '"moderated_at" TIMESTAMP(3)',
        '"moderated_by_admin_id" TEXT',
      ]) {
        expect(sql).toContain(column);
      }
      expect(sql).toContain(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_moderated_by_admin_id_fkey" FOREIGN KEY ("moderated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;`,
      );
    },
  );
});
