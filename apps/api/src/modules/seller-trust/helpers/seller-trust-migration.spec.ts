import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261021165740_seller_trust_scores`: the CHECK and the fillfactor are raw
 * SQL that Prisma does not model, so a later `prisma migrate dev` cannot
 * re-create them and nothing else would notice them missing.
 *
 * - The CHECK keeps a stored score inside 0..500 hundredths.
 * - `fillfactor = 90` with the primary key as the only index keeps the nightly
 *   upsert of every row a HOT update (no index rewrite, no bloat).
 */
describe("seller trust scores migration", () => {
  const root = apiAppRoot();
  const sql = readFileSync(
    join(
      root,
      "prisma/migrations/20261021165740_seller_trust_scores/migration.sql",
    ),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const statements = sql.replace(/--.*$/gm, "");

  it("creates the table with the 0..500 CHECK and fillfactor 90", () => {
    expect(statements).toMatch(/CREATE TABLE "seller_trust_scores"/);
    expect(statements).toMatch(
      /CONSTRAINT "seller_trust_scores_score_x100_range" CHECK \("score_x100" BETWEEN 0 AND 500\)/,
    );
    expect(statements).toMatch(/\)\s*WITH \(fillfactor = 90\);/);
    expect(statements).toMatch(/"score_x100" SMALLINT,/);
  });

  it("indexes nothing but the primary key", () => {
    expect(statements).toMatch(
      /CONSTRAINT "seller_trust_scores_pkey" PRIMARY KEY \("user_id"\)/,
    );
    expect(statements).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });

  it("is additive: touches no other table and writes no data", () => {
    // Statements, not the `ON DELETE / ON UPDATE CASCADE` of the foreign key.
    expect(statements).not.toMatch(/^\s*(DROP|UPDATE|DELETE|INSERT)\b/im);
    expect(statements).not.toMatch(/\bRENAME\b|\bDROP\b/i);
    const altered = [...statements.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(altered).toEqual(["seller_trust_scores"]);
  });

  it("cascades with the user (derived data, not financial)", () => {
    expect(statements).toMatch(
      /FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/,
    );
    expect(schema).toMatch(
      /model SellerTrustScore \{[\s\S]*?onDelete: Cascade[\s\S]*?@@map\("seller_trust_scores"\)/,
    );
  });
});
