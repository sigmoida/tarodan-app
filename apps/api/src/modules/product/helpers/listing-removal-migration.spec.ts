import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LISTING_REMOVAL_REASONS } from "@tarodan/types";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261005210000_listing_removal_reasons` yaşayan `products` tablosuna
 * dokunur: yalnız toplamalı olmalı (boş bırakılabilir, varsayılansız kolon) ve
 * hiçbir satırı geri doldurmamalı — bu özellikten önce düşen ilanlar
 * "bilinmiyor" kalır (ürün kararı). Olay tablosu eklemeye açık tek yönlüdür.
 */
describe("listing removal reasons migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261005210000_listing_removal_reasons/migration.sql",
    ),
    "utf8",
  );
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("enum değerleri katalogla aynı sırada (takip göçünün eklediği `traded` hariç)", () => {
    const match = statements.match(
      /CREATE TYPE "ListingRemovalReason" AS ENUM \(([^)]*)\)/,
    );
    expect(match).not.toBeNull();
    const values = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(/'/g, ""));
    // `traded` sonradan 20261005220000 göçüyle eklendi (bu göç düzenlenmez).
    expect(values).toEqual(
      LISTING_REMOVAL_REASONS.filter((reason) => reason !== "traded"),
    );
  });

  it("products.removal_reason boş bırakılabilir ve varsayılansız eklenir", () => {
    expect(statements).toMatch(
      /ALTER TABLE "products" ADD COLUMN "removal_reason" "ListingRemovalReason";/,
    );
    expect(statements).not.toMatch(/removal_reason"[^,;]*NOT NULL/i);
    expect(statements).not.toMatch(/removal_reason"[^,;]*DEFAULT/i);
  });

  it("olay 'vitrinden mi' bayrağını zorunlu taşır (dashboard sayımı)", () => {
    expect(statements).toMatch(/"from_storefront" BOOLEAN NOT NULL/);
    expect(statements).toMatch(
      /CREATE INDEX "product_removal_events_from_storefront_created_at_idx"/,
    );
  });

  it("hiçbir satırı geri doldurmaz, hiçbir şeyi silmez", () => {
    expect(statements).not.toMatch(/UPDATE\s+"?products"?/i);
    expect(statements).not.toMatch(/INSERT\s+INTO/i);
    expect(statements).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
  });

  it("olay tablosu UPDATE'e kapalıdır (ekleme-yalnız tetikleyici)", () => {
    expect(statements).toMatch(
      /CREATE TRIGGER product_removal_events_append_only_guard\s+BEFORE UPDATE ON "product_removal_events"/,
    );
  });

  it("şema aynı adları kullanır", () => {
    const schema = readFileSync(
      join(apiAppRoot(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toMatch(
      /removalReason\s+ListingRemovalReason\?\s+@map\("removal_reason"\)/,
    );
    expect(schema).toMatch(/model ProductRemovalEvent \{/);
    expect(schema).toMatch(/@@map\("product_removal_events"\)/);
  });
});

/**
 * `20261005220000_listing_removal_followups`: iki ürün kararı — `traded` nedeni
 * ve platform kırılımına geç giren "başka platformda sattım" bayrağı. Yalnız
 * toplamalı; geri doldurma yok, olay tablosu tetikleyicisi bozulmaz.
 */
describe("listing removal follow-ups migration", () => {
  const sql = readFileSync(
    join(
      apiAppRoot(),
      "prisma/migrations/20261005220000_listing_removal_followups/migration.sql",
    ),
    "utf8",
  );
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("`traded` değerini katalogdaki yerine (out_of_stock'tan sonra) ekler", () => {
    expect(statements).toMatch(
      /ALTER TYPE "ListingRemovalReason" ADD VALUE IF NOT EXISTS 'traded' AFTER 'out_of_stock';/,
    );
    const order = [...LISTING_REMOVAL_REASONS];
    expect(order[order.indexOf("traded") - 1]).toBe("out_of_stock");
  });

  it("geç platform bayrağı varsayılanlı eklenir; hiçbir satır güncellenmez", () => {
    expect(statements).toMatch(
      /ADD COLUMN "late_sold_elsewhere" BOOLEAN NOT NULL DEFAULT false/,
    );
    expect(statements).not.toMatch(
      /UPDATE\s+"?(products|product_removal_events)"?/i,
    );
    expect(statements).not.toMatch(/INSERT\s+INTO/i);
    expect(statements).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE|TRIGGER)/i);
  });

  it("şema aynı adı ve enum değerini taşır", () => {
    const schema = readFileSync(
      join(apiAppRoot(), "prisma/schema.prisma"),
      "utf8",
    );
    expect(schema).toMatch(
      /lateSoldElsewhere\s+Boolean\s+@default\(false\)\s+@map\("late_sold_elsewhere"\)/,
    );
    expect(schema).toMatch(/out_of_stock\n\s+traded\n\s+return_quarantine/);
  });
});
