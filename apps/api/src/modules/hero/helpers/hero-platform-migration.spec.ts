import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_PLATFORMS } from "@tarodan/types";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261016100000_hero_platform`: hero slaytına hedef istemci. CANLIDA yalnız
 * ekleme — kolon varsayılanla gelir (mevcut slaytlar `all`), satır yazan ya
 * da düşüren ifade yok. `ContentPlatform` reklamla ortak: tip tekrar
 * kurulmaya çalışılırsa göç patlamamalı.
 */
describe("hero platform migration", () => {
  const root = apiAppRoot();
  const NAME = "20261016100000_hero_platform";
  const sql = readFileSync(
    join(root, "prisma/migrations", NAME, "migration.sql"),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  const statements = sql.replace(/--.*$/gm, "");

  it("açıklamayla başlar", () => {
    expect(sql.trim().startsWith("--")).toBe(true);
  });

  it("yalnız ekler: DROP/DELETE/UPDATE/INSERT/TRUNCATE/RENAME yok", () => {
    expect(statements).not.toMatch(
      /\b(DROP|DELETE|UPDATE|INSERT|TRUNCATE|RENAME)\b/i,
    );
    expect(statements.match(/ALTER TABLE "(\w+)" (\w+ \w+)/g)).toEqual([
      'ALTER TABLE "hero_slides" ADD COLUMN',
    ]);
  });

  it("ortak tipi yinelenmeye dayanıklı kurar, değerler sözleşmeyle aynı", () => {
    expect(statements).toMatch(
      /DO \$\$ BEGIN CREATE TYPE "ContentPlatform" AS ENUM \([^)]*\); EXCEPTION WHEN duplicate_object THEN null; END \$\$;/,
    );
    const values = /CREATE TYPE "ContentPlatform" AS ENUM \(([^)]*)\)/
      .exec(sql)?.[1]
      .split(",")
      .map((v) => v.trim().replace(/'/g, ""));
    expect(values).toEqual([...CONTENT_PLATFORMS]);
  });

  it("mevcut slaytlar ikisinde de görünür (varsayılan all)", () => {
    expect(statements).toContain(
      `ADD COLUMN "platform" "ContentPlatform" NOT NULL DEFAULT 'all'`,
    );
  });

  it("şema: enum değerleri ve HeroSlide kolonu göçle aynı", () => {
    const enumBody =
      /enum ContentPlatform \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(
      enumBody
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//")),
    ).toEqual([...CONTENT_PLATFORMS]);
    const model = /model HeroSlide \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model).toMatch(/\bplatform\s+ContentPlatform\s+@default\(all\)/);
  });
});
