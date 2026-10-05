import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * Göç sözleşmesi: hazırlık süresi uzatma kolonları CANLI `orders` tablosuna
 * iner. Yalnız ekleme olmalı (yeniden yazma, silme, NOT NULL, varsayılan ya da
 * geri doldurma yok): NULL "hiç uzatılmadı" demektir ve mevcut siparişlerin
 * davranışı göçle değişmemelidir.
 */
describe("preparing deadline extension migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261005180000_order_preparing_deadline_extension/migration.sql",
    ),
    "utf8",
  );
  /** `--` yorumları atılmış ifadeler: düzyazı bir beklentiyi karşılayamasın. */
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  it("adds exactly the two nullable timestamp columns", () => {
    expect(statements).toEqual([
      'ALTER TABLE "orders" ADD COLUMN "preparing_extended_at" TIMESTAMP(3)',
      'ALTER TABLE "orders" ADD COLUMN "original_preparing_deadline" TIMESTAMP(3)',
    ]);
  });

  it("never rewrites, drops or backfills live rows", () => {
    const body = statements.join("\n").toUpperCase();
    for (const forbidden of [
      "UPDATE",
      "DELETE",
      "DROP",
      "NOT NULL",
      "DEFAULT",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });
});
