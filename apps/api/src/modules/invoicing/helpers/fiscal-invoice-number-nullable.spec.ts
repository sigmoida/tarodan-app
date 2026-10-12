import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAppRoot } from "../../../common/helpers/app-root";

/**
 * Sağlayıcı numaralandırması (Netsis) kaydı NUMARASIZ açar; numara gönderim
 * sonucundan yazılır. Bu yüzden `FiscalInvoice.invoiceNumber` boş
 * olabilmeli — ve hep öyleydi: kolon `20260630175419_add_elogo_invoice`'ta
 * NULL'a izin verilerek açıldı ve hiçbir göç onu NOT NULL yapmadı. Yeni bir
 * göç gerekmedi (veri de taşınmadı); bu sözleşme o hâli sabitler ki biri
 * "numara hep dolu" varsayımıyla kolonu daraltmasın — o gün Netsis kesimi
 * ilk faturada patlar.
 *
 * Fiziksel tablo adı (`elogo_invoices` / `fiscal_invoices`) bilerek kalıp
 * dışıdır: sözleşme kolona bağlıdır, tablonun adına değil.
 */
describe("fiscal invoice number stays nullable", () => {
  const root = apiAppRoot();
  const migrationsDir = join(root, "prisma/migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_/.test(name))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"),
    }));
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

  it("kolon NULL'a izin verilerek açıldı", () => {
    const creation = migrations.find(
      (m) => m.name === "20260630175419_add_elogo_invoice",
    );
    expect(creation?.sql).toMatch(/"invoice_number" TEXT,/);
    expect(creation?.sql).not.toMatch(/"invoice_number" TEXT NOT NULL/);
  });

  it("hiçbir göç e-belge numarasını NOT NULL yapmıyor", () => {
    const offenders = migrations.filter(({ sql }) =>
      /ALTER TABLE "(?:elogo_invoices|fiscal_invoices)"[^;]*ALTER COLUMN "invoice_number" SET NOT NULL/i.test(
        sql,
      ),
    );
    expect(offenders.map((m) => m.name)).toEqual([]);
  });

  it("hiçbir göç e-belge numarasının tekilliğini kaldırmıyor", () => {
    const offenders = migrations.filter(({ sql }) =>
      /DROP INDEX[^;]*(?:elogo|fiscal)_invoices_invoice_number_key/i.test(sql),
    );
    expect(offenders.map((m) => m.name)).toEqual([]);
  });

  it("şema numarayı isteğe bağlı ve tekil tanımlar", () => {
    const model = schema.slice(schema.indexOf("model FiscalInvoice {"));
    const body = model.slice(0, model.indexOf("\n}"));
    expect(body).toMatch(/\n\s*invoiceNumber\s+String\?\s+@unique\b/);
  });
});
