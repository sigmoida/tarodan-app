-- Faz 1b (Netsis geçişi): e-belge kaydı sağlayıcıdan bağımsız hâle gelir.
--
-- Kod tarafında model/alan adları sağlayıcıdan bağımsızdır (FiscalInvoice,
-- providerRef, …) ama VERİTABANI ADLARI BİLEREK DEĞİŞMEZ: `elogo_invoices`,
-- `elogo_doc_sequences`, `elogo_ref_id` vb. Prisma `@map` ile eşlenir.
-- Fiziksel yeniden adlandırma deploy penceresinde eski imajı kırar ve geri
-- dönüşü zorlaştırır; görünür bir faydası yoktur.
--
-- Eklenen tek şey `provider` kolonu: belgeyi KESEN sağlayıcı. Bu kolon
-- eklenmeden önceki her kayıt eLogo'yla kesildiği için varsayılan `elogo`dur;
-- geriye doldurma gerekmez. Ek, geriye dönük uyumludur: eski imaj kolonu yok
-- sayar.
BEGIN;

CREATE TYPE "EInvoiceProviderName" AS ENUM ('elogo', 'netsis');

ALTER TABLE "elogo_invoices"
  ADD COLUMN "provider" "EInvoiceProviderName" NOT NULL DEFAULT 'elogo';

COMMIT;
