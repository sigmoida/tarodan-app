import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261012100000_ad_hotspots`: görselli reklamda tıklama yalnız alanlarda.
 * Göç, bugün tıklanabilir olan her görselli reklama görselin TAMAMINI kaplayan
 * tek bir alan verir ve `link_url`'ini boşaltır — mevcut reklamlar göç sonrası
 * tam eskisi gibi tıklanır. Metin reklamlara dokunulmaz.
 */
describe("ad hotspots migration", () => {
  const root = apiAppRoot();
  const migrations = join(root, "prisma/migrations");
  const NAME = "20261012100000_ad_hotspots";
  const sql = readFileSync(join(migrations, NAME, "migration.sql"), "utf8");
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  it("topbar göçünden sonra sıralanır", () => {
    const names = readdirSync(migrations).filter((n) => /^\d{14}_/.test(n));
    const sorted = [...names].sort();
    expect(sorted.indexOf(NAME)).toBeGreaterThan(
      sorted.indexOf("20261009120000_ad_position_topbar"),
    );
  });

  it("tabloyu kesir koordinatlar, bağlantı, ad, sıra ve tık sayacıyla kurar", () => {
    expect(sql).toContain('CREATE TABLE "advertisement_hotspots"');
    for (const column of [
      '"advertisement_id" TEXT NOT NULL',
      '"x" DOUBLE PRECISION NOT NULL',
      '"y" DOUBLE PRECISION NOT NULL',
      '"width" DOUBLE PRECISION NOT NULL',
      '"height" DOUBLE PRECISION NOT NULL',
      '"link_url" TEXT NOT NULL',
      '"label" TEXT NOT NULL',
      '"sort_order" INTEGER NOT NULL DEFAULT 0',
      '"click_count" INTEGER NOT NULL DEFAULT 0',
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("reklama CASCADE ile bağlanır ve reklam kimliği indekslidir", () => {
    expect(sql).toMatch(
      /FOREIGN KEY \("advertisement_id"\) REFERENCES "advertisements"\("id"\)\s+ON DELETE CASCADE/,
    );
    expect(sql).toContain(
      'CREATE INDEX "advertisement_hotspots_advertisement_id_idx"',
    );
  });

  it("görsel + bağlantılı her reklama tam-görsel alan ekler, link_url'i SONRA boşaltır", () => {
    const insert = sql.indexOf('INSERT INTO "advertisement_hotspots"');
    const clear = sql.search(
      /UPDATE "advertisements"\s+SET "link_url" = NULL/,
    );
    expect(insert).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(insert);

    const insertSql = sql.slice(insert, clear);
    expect(insertSql).toMatch(/gen_random_uuid\(\)::text, "id", 0, 0, 1, 1,/);
    expect(insertSql).toMatch(/"link_url", left\(btrim\("title"\), 80\), 0, 0/);
    expect(insertSql).toMatch(/COALESCE\("image_url", ''\) <> ''/);
    expect(insertSql).toMatch(/COALESCE\("link_url", ''\) <> ''/);
  });

  it("yalnız görselli reklamların bağlantısını boşaltır; satır silmez", () => {
    expect(sql).toMatch(
      /SET "link_url" = NULL[^;]*WHERE COALESCE\("image_url", ''\) <> ''/,
    );
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("açıklamayla başlar ve tek işlemdir", () => {
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it("şema modeli aynı tabloya CASCADE ile eşlenir", () => {
    const model = /model AdHotspot \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model).toContain('@@map("advertisement_hotspots")');
    expect(model).toMatch(/onDelete: Cascade/);
    expect(model).toContain("@@index([advertisementId])");
    expect(schema).toMatch(/hotspots\s+AdHotspot\[\]/);
  });
});
