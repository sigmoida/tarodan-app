-- Siparis finansal kararlari checkout aninda immutable snapshot olarak saklanir.
ALTER TABLE "orders"
  ADD COLUMN "financial_snapshot" JSONB;

-- Bir siparis icin yalnizca tek yerel fatura olabilir. Mevcut bir ortamda ayni
-- order_id icin birden fazla kayit varsa migration bilerek fail eder; finansal
-- kayitlar otomatik silinmemeli, deployment oncesi manuel mutabakat yapilmalidir.
DROP INDEX IF EXISTS "invoices_order_id_idx";
CREATE UNIQUE INDEX "invoices_order_id_key"
  ON "invoices"("order_id");
