-- Faturaya İŞLEMİN TARAFLARI ve GERÇEKLEŞME ŞEKLİ eklenir.
--
-- `elogo_invoices` bugüne kadar yalnız belgenin MUHATABINI tutuyordu; kaynak
-- kayıt ise tipsiz tek bir string (`source_id`) ve tipe göre başka tabloyu
-- gösteriyor (koli / sipariş / takas ödemesi / boost / üyelik ödemesi / iade
-- talebi). Bu yüzden admin fatura listesi "satıcı", "alıcı" ve "sipariş
-- gerçekleşme şekli" kolonlarını ne gösterebiliyor ne de bunlara göre
-- filtreleyip sıralayabiliyordu — sayfalama sunucuda yapılıyor.
--
-- Kolonlar kesim anında yazılır (`resolveInvoiceParties`). Bu migration'dan
-- ÖNCE kesilmiş belgeler için ayrı backfill script'i vardır:
-- `apps/api/maintenance/backfill-elogo-invoice-parties.ts` (aynı çözümleyiciyi koşar).
CREATE TYPE "ElogoInvoiceContext" AS ENUM ('direct_sale', 'offer', 'trade', 'platform_service');

ALTER TABLE "elogo_invoices"
  ADD COLUMN "seller_user_id" TEXT,
  ADD COLUMN "buyer_user_id"  TEXT,
  ADD COLUMN "context" "ElogoInvoiceContext";

-- Kullanıcı kaydı silinmiyor (anonimleştiriliyor); yine de bir belge kimliksiz
-- kalabilsin diye SET NULL — fatura kaydı hiçbir koşulda silinmemeli.
ALTER TABLE "elogo_invoices"
  ADD CONSTRAINT "elogo_invoices_seller_user_id_fkey"
  FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "elogo_invoices"
  ADD CONSTRAINT "elogo_invoices_buyer_user_id_fkey"
  FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "elogo_invoices_seller_user_id_idx" ON "elogo_invoices"("seller_user_id");
CREATE INDEX "elogo_invoices_buyer_user_id_idx" ON "elogo_invoices"("buyer_user_id");
CREATE INDEX "elogo_invoices_context_idx" ON "elogo_invoices"("context");
