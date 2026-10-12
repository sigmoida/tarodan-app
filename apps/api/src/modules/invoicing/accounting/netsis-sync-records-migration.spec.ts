import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261012150000_netsis_sync_records`: muhasebe senkronunun iş kayıtları.
 *
 * Göç YALNIZ ekler (iki enum + bir tablo): deploy penceresinde eski imaj tabloyu
 * yok sayar, geri dönüş tabloyu bırakmaktan ibarettir. Tekillik anahtarları
 * idempotency'nin DB güvencesidir — biri kaybolursa outbox'ın ikinci teslimi
 * Netsis'e ikinci bir kayıt yazardı.
 */
describe("netsis sync records migration", () => {
  const root = apiAppRoot();
  const NAME = "20261012150000_netsis_sync_records";
  const sql = readFileSync(
    join(root, "prisma/migrations", NAME, "migration.sql"),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  const block = (keyword: "model" | "enum", name: string) => {
    const match = schema.match(
      new RegExp(`${keyword} ${name} \\{[\\s\\S]*?\\n\\}`),
    );
    if (!match) throw new Error(`${keyword} ${name} not found in schema`);
    return match[0];
  };

  it("is additive only: no RENAME, DROP, DELETE, UPDATE or ALTER of existing tables", () => {
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bALTER\b/i);
  });

  it("explains itself and runs in one transaction", () => {
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/\nBEGIN;\n/);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("creates the enums and the table with the idempotency guarantees", () => {
    expect(sql).toContain(
      `CREATE TYPE "NetsisSyncKind" AS ENUM ('invoice_collection', 'settlement_transfer', 'payout_transfer', 'refund_reversal');`,
    );
    expect(sql).toContain(
      `CREATE TYPE "NetsisSyncStatus" AS ENUM ('pending', 'processing', 'synced', 'failed', 'skipped');`,
    );
    expect(sql).toContain(`CREATE TABLE "netsis_sync_records"`);
    expect(sql).toContain(
      `CREATE UNIQUE INDEX "netsis_sync_records_idempotency_key_key" ON "netsis_sync_records"("idempotency_key");`,
    );
    expect(sql).toContain(
      `CREATE UNIQUE INDEX "netsis_sync_records_kind_source_id_key" ON "netsis_sync_records"("kind", "source_id");`,
    );
  });

  it("matches the schema model (names, uniques, money as Decimal)", () => {
    const model = block("model", "NetsisSyncRecord");
    expect(model).toContain('@@map("netsis_sync_records")');
    expect(model).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(model).toContain("@@unique([kind, sourceId])");
    expect(model).toMatch(/amount\s+Decimal\?\s+@db\.Decimal\(12, 2\)/);
    expect(model).toMatch(/netsisRef\s+String\?\s+@map\("netsis_ref"\)/);
    // Polimorfik kaynak: FK yok.
    expect(model).not.toContain("@relation");

    for (const value of [
      "invoice_collection",
      "settlement_transfer",
      "payout_transfer",
      "refund_reversal",
    ]) {
      expect(block("enum", "NetsisSyncKind")).toContain(value);
    }
    for (const value of ["pending", "processing", "synced", "failed", "skipped"]) {
      expect(block("enum", "NetsisSyncStatus")).toContain(value);
    }
  });
});
