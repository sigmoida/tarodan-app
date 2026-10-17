import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdPosition } from "@prisma/client";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261009120000_ad_position_topbar`: `sidebar` kalkar, `topbar` gelir.
 * Kaldırılan değerdeki satırlar silinmez; `inline`'a taşınıp PASİFE alınır —
 * hiç görünmemiş bir reklam göç sonrası habersizce yayına girmemeli. Tip,
 * değer kaldırmanın tek yolu olan yeniden-kurma kalıbıyla değişir.
 */
describe("ad position topbar migration", () => {
  const root = apiAppRoot();
  const sql = readFileSync(
    join(
      root,
      "prisma/migrations/20261009120000_ad_position_topbar/migration.sql",
    ),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  it("yeni tip tam olarak beş yuvayı taşır", () => {
    expect(sql).toContain(
      `CREATE TYPE "AdPosition_new" AS ENUM ('topbar', 'header', 'footer', 'inline', 'popup')`,
    );
  });

  it("sidebar satırlarını tip değişmeden ÖNCE inline + pasif yapar", () => {
    const update = sql.search(
      /UPDATE "advertisements"\s+SET "position" = 'inline', "is_active" = false/,
    );
    const alter = sql.indexOf('TYPE "AdPosition_new" USING');
    expect(update).toBeGreaterThan(-1);
    expect(sql).toMatch(/WHERE "position" = 'sidebar'/);
    expect(update).toBeLessThan(alter);
  });

  it("satır silmez; header satırlarına dokunmaz", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"advertisements"/i);
    expect(sql).not.toMatch(/WHERE "position" = 'header'/);
  });

  it("eski tipi kaldırır ve varsayılanı geri koyar, tek işlemde", () => {
    expect(sql).toContain('DROP TYPE "AdPosition_old"');
    expect(sql).toContain(
      `ALTER TABLE "advertisements" ALTER COLUMN "position" SET DEFAULT 'header'`,
    );
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it("şema ve üretilmiş istemci aynı beş değeri taşır", () => {
    const block = /enum AdPosition \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
    const values = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("///"));
    expect(values).toEqual(["topbar", "header", "footer", "inline", "popup"]);
    expect(Object.values(AdPosition)).toEqual(values);
  });
});
