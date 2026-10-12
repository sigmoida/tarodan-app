import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261012120000_fiscal_invoice_provider`: e-belge kaydı sağlayıcıdan bağımsız
 * hâle gelir ama VERİTABANI ADLARI DEĞİŞMEZ — fiziksel yeniden adlandırma deploy
 * penceresinde eski imajı kırar ve geri dönüşü zorlaştırır. Kod adları
 * (`FiscalInvoice`, `providerRef`…) tarihsel DB adlarına `@map` ile eşlenir;
 * göç yalnız geriye dönük uyumlu `provider` kolonunu ekler.
 *
 * Bu spec iki şeyi sabitler: göç dosyası eklemeden başka bir şey yapmaz
 * (RENAME/DROP yok) ve şema tarihsel DB adlarını korur — biri değişirse
 * bilerek değişmeli (OPERATIONS.md deploy notuyla birlikte).
 */
describe("fiscal invoice provider migration", () => {
  const root = apiAppRoot();
  const NAME = "20261012120000_fiscal_invoice_provider";
  const sql = readFileSync(
    join(root, "prisma/migrations", NAME, "migration.sql"),
    "utf8",
  );
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  const modelBlock = (name: string) => {
    const match = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    if (!match) throw new Error(`model ${name} not found in schema`);
    return match[0];
  };
  const enumBlock = (name: string) => {
    const match = schema.match(new RegExp(`enum ${name} \\{[\\s\\S]*?\\n\\}`));
    if (!match) throw new Error(`enum ${name} not found in schema`);
    return match[0];
  };

  it("only adds the provider enum and column, inside one transaction", () => {
    expect(sql).toContain(
      `CREATE TYPE "EInvoiceProviderName" AS ENUM ('elogo', 'netsis');`,
    );
    expect(sql).toMatch(
      /ALTER TABLE "elogo_invoices"\s+ADD COLUMN "provider" "EInvoiceProviderName" NOT NULL DEFAULT 'elogo';/,
    );
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/\nBEGIN;\n/);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("renames or drops nothing (old image keeps working during deploy)", () => {
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toContain("fiscal_invoices");
  });

  it("maps the provider-neutral model and enums onto the historical DB names", () => {
    const invoice = modelBlock("FiscalInvoice");
    expect(invoice).toContain('@@map("elogo_invoices")');
    expect(invoice).toMatch(/providerRef\s+String\?\s+@map\("elogo_ref_id"\)/);
    expect(invoice).toMatch(
      /providerResultCode\s+Int\?\s+@map\("elogo_result_code"\)/,
    );
    expect(invoice).toMatch(
      /providerResultMsg\s+String\?\s+@map\("elogo_result_msg"\)/,
    );
    expect(invoice).toMatch(
      /provider\s+EInvoiceProviderName\s+@default\(elogo\)/,
    );

    expect(modelBlock("FiscalDocSequence")).toContain(
      '@@map("elogo_doc_sequences")',
    );
    expect(enumBlock("FiscalInvoiceType")).toContain(
      '@@map("ElogoInvoiceType")',
    );
    expect(enumBlock("FiscalInvoiceContext")).toContain(
      '@@map("ElogoInvoiceContext")',
    );
    expect(enumBlock("FiscalInvoiceStatus")).toContain(
      '@@map("ElogoInvoiceStatus")',
    );
  });

  it("leaves no provider-branded model names in the schema", () => {
    expect(schema).not.toMatch(/model ElogoInvoice\b/);
    expect(schema).not.toMatch(/model ElogoDocSequence\b/);
    expect(schema).not.toMatch(/enum ElogoInvoice/);
    expect(schema).not.toContain('@@map("fiscal_');
  });
});
