import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261013100000_trust_badge_hide_on_ios`: güven rozetlerine native gizleme
 * bayrağı. CANLIDA yalnız ekleme — sabit varsayılanlı tek kolon; mevcut
 * rozetlerin davranışı değişmez.
 */
describe("trust badge hide_on_ios migration", () => {
  const root = apiAppRoot();
  const migrations = join(root, "prisma/migrations");
  const NAME = "20261013100000_trust_badge_hide_on_ios";
  const sql = readFileSync(join(migrations, NAME, "migration.sql"), "utf8");
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const statements = sql.replace(/--.*$/gm, "").trim();

  it("hero CMS göçünden sonra sıralanır", () => {
    const sorted = readdirSync(migrations)
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    expect(sorted.indexOf(NAME)).toBeGreaterThan(
      sorted.indexOf("20261012140000_hero_cms"),
    );
  });

  it("tek ifade: varsayılanı false olan NOT NULL kolon ekler", () => {
    expect(statements).toBe(
      'ALTER TABLE "trust_badges" ADD COLUMN "hide_on_ios" BOOLEAN NOT NULL DEFAULT false;',
    );
    expect(statements).not.toMatch(/\b(DROP|DELETE|UPDATE|TRUNCATE|RENAME)\b/i);
  });

  it("şema kolonla aynı: TrustBadge.hideOnIos @default(false) @map(hide_on_ios)", () => {
    const model = /model TrustBadge \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
    expect(model).toMatch(
      /hideOnIos\s+Boolean\s+@default\(false\)\s+@map\("hide_on_ios"\)/,
    );
  });
});
