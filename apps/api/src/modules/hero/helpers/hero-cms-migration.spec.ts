import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HERO_IMAGE_SIDES, HERO_PLACEMENTS } from "@tarodan/types";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261012140000_hero_cms`: hero slaytları + güven rozetleri. CANLIDA
 * yalnız ekleme — mevcut tabloya dokunan, satır silen ya da kolon düşüren
 * tek ifade yok; satırlar göçle değil referans seed'iyle gelir.
 */
describe("hero CMS migration", () => {
  const root = apiAppRoot();
  const migrations = join(root, "prisma/migrations");
  const NAME = "20261012140000_hero_cms";
  const sql = readFileSync(join(migrations, NAME, "migration.sql"), "utf8");
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  // Yorumlar ifade sayılmaz.
  const statements = sql.replace(/--.*$/gm, "");

  it("en son göç olarak sıralanır", () => {
    const names = readdirSync(migrations).filter((n) => /^\d{14}_/.test(n));
    const sorted = [...names].sort();
    expect(sorted.indexOf(NAME)).toBeGreaterThan(
      sorted.indexOf("20261012120000_fiscal_invoice_provider"),
    );
  });

  it("yalnız ekler: ALTER/DROP/DELETE/UPDATE/INSERT/TRUNCATE yok", () => {
    expect(statements).not.toMatch(
      /\b(ALTER|DROP|DELETE|UPDATE|INSERT|TRUNCATE|RENAME)\b/i,
    );
    const creates = statements.match(/CREATE (TYPE|TABLE|INDEX) "(\w+)"/g);
    expect(creates).toEqual([
      'CREATE TYPE "HeroPlacement"',
      'CREATE TYPE "HeroImageSide"',
      'CREATE TABLE "hero_slides"',
      'CREATE INDEX "hero_slides_placement_is_active_display_order_idx"',
      'CREATE TABLE "trust_badges"',
      'CREATE INDEX "trust_badges_is_active_display_order_idx"',
    ]);
  });

  it("enum değerleri paylaşılan sözleşmeyle aynıdır", () => {
    const values = (type: string) =>
      new RegExp(`CREATE TYPE "${type}" AS ENUM \\(([^)]*)\\)`)
        .exec(sql)?.[1]
        .split(",")
        .map((v) => v.trim().replace(/'/g, ""));
    expect(values("HeroPlacement")).toEqual([...HERO_PLACEMENTS]);
    expect(values("HeroImageSide")).toEqual([...HERO_IMAGE_SIDES]);
  });

  it("hero_slides: metinler JSONB, sayaçlar sıfırdan, iOS bayrağı kapalı", () => {
    for (const column of [
      '"placement" "HeroPlacement" NOT NULL',
      '"is_active" BOOLEAN NOT NULL DEFAULT true',
      '"image_url" TEXT NOT NULL',
      '"mobile_image_url" TEXT,',
      `"image_side" "HeroImageSide" NOT NULL DEFAULT 'right'`,
      '"title" JSONB NOT NULL',
      '"subtitle" JSONB,',
      '"image_alt" JSONB,',
      '"cta1_label" JSONB,',
      '"cta1_href" TEXT,',
      '"cta2_label" JSONB,',
      '"cta2_href" TEXT,',
      '"hide_on_ios" BOOLEAN NOT NULL DEFAULT false',
      '"impression_count" INTEGER NOT NULL DEFAULT 0',
      '"click_count" INTEGER NOT NULL DEFAULT 0',
      '"cta1_click_count" INTEGER NOT NULL DEFAULT 0',
      '"cta2_click_count" INTEGER NOT NULL DEFAULT 0',
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("trust_badges: ikon metin (enum değil), başlık zorunlu JSONB", () => {
    expect(sql).toContain('"icon" TEXT NOT NULL');
    expect(sql).toMatch(/"trust_badges"[\s\S]*"title" JSONB NOT NULL/);
    expect(sql).toMatch(/"trust_badges"[\s\S]*"description" JSONB,/);
  });

  it("açıklamayla başlar", () => {
    expect(sql.trim().startsWith("--")).toBe(true);
  });

  it("şema modelleri aynı tablolara ve indekslere eşlenir", () => {
    const model = (name: string) =>
      new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
    expect(model("HeroSlide")).toContain('@@map("hero_slides")');
    expect(model("HeroSlide")).toContain(
      "@@index([placement, isActive, displayOrder])",
    );
    expect(model("TrustBadge")).toContain('@@map("trust_badges")');
    expect(model("TrustBadge")).toContain("@@index([isActive, displayOrder])");
  });
});
