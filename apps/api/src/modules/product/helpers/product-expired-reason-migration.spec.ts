import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261005160000_product_expired_reason` yaşayan, yoğun trafikli `products`
 * tablosuna eklenir: yalnız toplamalı olmalı (yeni enum değeri + boş bırakılabilir
 * kolon). Varsayılan, NOT NULL ya da geri doldurma her satırı yeniden yazar ve
 * bu özelliğin görüşü olmayan ilanlara değer zorlar.
 */
describe("product expired-reason migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261005160000_product_expired_reason/migration.sql",
    ),
    "utf8",
  );
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("mevcut enum'a 'expired' değerini ekler (yeni enum yaratmaz)", () => {
    expect(statements).toMatch(
      /ALTER TYPE "ProductInactiveReason" ADD VALUE IF NOT EXISTS 'expired'/,
    );
    expect(statements).not.toMatch(/CREATE TYPE/i);
  });

  it("onay izi kolonunu boş bırakılabilir, varsayılansız ekler", () => {
    expect(statements).toContain('ADD COLUMN "approved_content_fingerprint"');
    expect(statements).not.toMatch(/approved_content_fingerprint[^,;]*NOT NULL/i);
    expect(statements).not.toMatch(/approved_content_fingerprint[^,;]*DEFAULT/i);
  });

  it("hiçbir satırı geri doldurmaz ya da yeniden yazmaz", () => {
    expect(statements).not.toMatch(/UPDATE\s+"products"/i);
    expect(statements).not.toMatch(/DROP|DELETE/i);
  });

  it("şema, enum'u ve kolonu aynı adlarla tanımlar", () => {
    const schema = readFileSync(
      join(apiAppRoot(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toMatch(
      /enum ProductInactiveReason \{\s*return_quarantine\s*expired\s*\}/,
    );
    expect(schema).toMatch(
      /approvedContentFingerprint\s+String\?\s+@map\("approved_content_fingerprint"\)/,
    );
  });
});
