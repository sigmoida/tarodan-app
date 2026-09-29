import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20260922110000_product_inactive_reason` must stay additive: a nullable
 * marker column bolted onto a live, high-traffic table (`products`). No
 * default, no backfill, no NOT NULL — any of those would rewrite every row
 * and/or force a value onto listings this feature has no opinion about.
 */
describe("product inactive-reason migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20260922110000_product_inactive_reason/migration.sql",
    ),
    "utf8",
  );

  it("creates the enum with only the one meaningful value", () => {
    expect(sql).toContain(
      `CREATE TYPE "ProductInactiveReason" AS ENUM ('return_quarantine')`,
    );
  });

  it("adds the column nullable, with no default and no backfill", () => {
    expect(sql).toContain('ADD COLUMN "inactive_reason"');
    expect(sql).not.toMatch(/inactive_reason[^,;]*NOT NULL/i);
    expect(sql).not.toMatch(/inactive_reason[^,;]*DEFAULT/i);
    expect(sql).not.toMatch(/UPDATE\s+"products"/i);
  });
});
