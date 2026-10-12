import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * `20261012120000_fiscal_invoices_rename`: e-belge kayıtları sağlayıcıdan
 * bağımsız adlara taşınır (`elogo_invoices` → `fiscal_invoices`).
 *
 * Yalnız ad değişir, veri taşınmaz. Kaçırılan tek bir indeks/kısıt adı canlıda
 * bir şey kırmaz ama `prisma migrate dev` onu sapma sayıp düzeltici bir göç
 * üretir; bu yüzden eski tabloda bugüne kadar YARATILAN her ad önceki göçlerden
 * okunur ve her birinin Prisma'nın varsayılan yeni adına çevrildiği sabitlenir.
 */
describe("fiscal invoices rename migration", () => {
  const root = apiAppRoot();
  const migrations = join(root, "prisma/migrations");
  const NAME = "20261012120000_fiscal_invoices_rename";
  const sql = readFileSync(join(migrations, NAME, "migration.sql"), "utf8");
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  const earlier = readdirSync(migrations)
    .filter((n) => /^\d{14}_/.test(n) && n < NAME)
    .sort()
    .map((n) => readFileSync(join(migrations, n, "migration.sql"), "utf8"))
    .join("\n");

  /** Önceki göçlerde verilen tabloya ait indeks ve kısıt adları. */
  const namesCreatedOn = (table: string) => {
    const indexes = [
      ...earlier.matchAll(
        new RegExp(`CREATE (?:UNIQUE )?INDEX "(\\w+)" ON "${table}"`, "g"),
      ),
    ].map((m) => m[1]);
    const constraints = [...earlier.matchAll(/CONSTRAINT "(\w+)"/g)]
      .map((m) => m[1])
      .filter((name) => name.startsWith(`${table}_`));
    return { indexes, constraints };
  };

  it("en son göçten sonra sıralanır", () => {
    const names = readdirSync(migrations)
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    expect(names.indexOf(NAME)).toBeGreaterThan(
      names.indexOf("20261012100000_ad_hotspots"),
    );
  });

  it("açıklamayla başlar, tek işlemdir ve hiçbir şey silmez", () => {
    expect(sql.trim().startsWith("--")).toBe(true);
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("tabloları, enum'ları ve sağlayıcıya özgü kolonları yeniden adlandırır", () => {
    for (const statement of [
      'ALTER TYPE "ElogoInvoiceType" RENAME TO "FiscalInvoiceType";',
      'ALTER TYPE "ElogoInvoiceContext" RENAME TO "FiscalInvoiceContext";',
      'ALTER TYPE "ElogoInvoiceStatus" RENAME TO "FiscalInvoiceStatus";',
      'ALTER TABLE "elogo_invoices" RENAME TO "fiscal_invoices";',
      'ALTER TABLE "elogo_doc_sequences" RENAME TO "fiscal_doc_sequences";',
      'RENAME COLUMN "elogo_ref_id" TO "provider_ref";',
      'RENAME COLUMN "elogo_result_code" TO "provider_result_code";',
      'RENAME COLUMN "elogo_result_msg" TO "provider_result_msg";',
    ]) {
      expect(sql).toContain(statement);
    }
  });

  it.each([
    ["elogo_invoices", "fiscal_invoices"],
    ["elogo_doc_sequences", "fiscal_doc_sequences"],
  ])(
    "%s üzerinde yaratılmış her indeks ve kısıt yeni varsayılan ada çevrilir",
    (oldTable, newTable) => {
      const { indexes, constraints } = namesCreatedOn(oldTable);
      // Okuyucunun kendisi bozulup hiçbir ad bulmazsa test boşuna geçmesin.
      expect(indexes.length + constraints.length).toBeGreaterThan(0);

      for (const name of indexes) {
        const renamed = name.replace(oldTable, newTable);
        expect(sql).toContain(`ALTER INDEX "${name}" RENAME TO "${renamed}";`);
      }
      for (const name of constraints) {
        const renamed = name.replace(oldTable, newTable);
        expect(sql).toContain(`RENAME CONSTRAINT "${name}" TO "${renamed}";`);
      }
    },
  );

  it("bilinen bütün adlar kapsanır (pkey, unique, idx, fkey)", () => {
    const { indexes, constraints } = namesCreatedOn("elogo_invoices");
    expect([...indexes, ...constraints].sort()).toEqual(
      [
        "elogo_invoices_buyer_user_id_fkey",
        "elogo_invoices_buyer_user_id_idx",
        "elogo_invoices_context_idx",
        "elogo_invoices_ettn_key",
        "elogo_invoices_invoice_number_key",
        "elogo_invoices_pkey",
        "elogo_invoices_recipient_user_id_idx",
        "elogo_invoices_seller_user_id_fkey",
        "elogo_invoices_seller_user_id_idx",
        "elogo_invoices_status_idx",
        "elogo_invoices_type_source_id_key",
      ].sort(),
    );
  });

  it("provider kolonu NOT NULL, varsayılanı elogo — mevcut kayıtlar eLogo'yla kesildi", () => {
    expect(sql).toContain(
      `CREATE TYPE "EInvoiceProviderName" AS ENUM ('elogo', 'netsis');`,
    );
    expect(sql).toContain(
      `ALTER TABLE "fiscal_invoices" ADD COLUMN "provider" "EInvoiceProviderName" NOT NULL DEFAULT 'elogo';`,
    );
    // Enum yeni tabloyla AYNI işlemde yaratılıp kullanılabilir (ADD VALUE değil).
    expect(sql.indexOf('CREATE TYPE "EInvoiceProviderName"')).toBeLessThan(
      sql.indexOf('ADD COLUMN "provider"'),
    );
  });

  it("şema modeli yeni tabloya ve kolonlara eşlenir, eski ad kalmaz", () => {
    const model =
      /model FiscalInvoice \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model).toContain('@@map("fiscal_invoices")');
    expect(model).toMatch(
      /\n\s+provider\s+EInvoiceProviderName\s+@default\(elogo\)/,
    );
    expect(model).toMatch(/providerRef\s+String\?\s+@map\("provider_ref"\)/);
    expect(model).toMatch(
      /providerResultCode\s+Int\?\s+@map\("provider_result_code"\)/,
    );
    expect(model).toMatch(
      /providerResultMsg\s+String\?\s+@map\("provider_result_msg"\)/,
    );
    expect(model).not.toMatch(/@map\("elogo_/);

    const sequence =
      /model FiscalDocSequence \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(sequence).toContain('@@map("fiscal_doc_sequences")');

    expect(schema).toMatch(
      /enum EInvoiceProviderName \{\s+elogo\s+netsis\s+\}/,
    );
    expect(schema).not.toMatch(/\bElogoInvoice(Type|Context|Status)?\b/);
    expect(schema).not.toMatch(/\bElogoDocSequence\b/);
  });
});
