-- e-Belge kayıtlarını sağlayıcıdan bağımsız adlara taşır (docs/INVOICING_PROVIDERS.md, Faz 1b).
--
-- `elogo_invoices` tek sağlayıcı varken konmuş bir addı; kayıt (kesim, deneme
-- bütçesi, iade/iptal) entegratörü bilmez ve Logo Netsis ikinci sağlayıcı
-- olacak. Yalnız YENİDEN ADLANDIRMA + bir ekleme yapılır:
--
--   * tablo, enum ve sayaç tablosu yeniden adlandırılır — veri taşınmaz;
--   * eLogo'ya özgü üç kolon `provider_*` adını alır;
--   * `provider` kolonu eklenir. Bugüne kadarki her belge eLogo'yla kesildi,
--     bu yüzden varsayılan `elogo`dur ve geriye doldurma gerekmez (sabit
--     varsayılanlı NOT NULL kolon Postgres 11+'da tabloyu yeniden yazmaz).
--
-- Kısıt ve indeksler Prisma'nın yeni tablo için ürettiği varsayılan adlara
-- çevrilir; yoksa `prisma migrate dev` eski adları sapma (drift) sayar.
--
-- DAĞITIM: eski imaj eski adları okur. Web ve worker aynı sürümle birlikte
-- yeniden başlatılmalı; aradaki kısa pencerede eski worker'ın fatura cron'u
-- hata verirse kayıtlar `pending`/`failed` kalır ve yeni sürümün cron'u toparlar.
BEGIN;

-- Enum'lar
ALTER TYPE "ElogoInvoiceType" RENAME TO "FiscalInvoiceType";
ALTER TYPE "ElogoInvoiceContext" RENAME TO "FiscalInvoiceContext";
ALTER TYPE "ElogoInvoiceStatus" RENAME TO "FiscalInvoiceStatus";

-- Belge tablosu
ALTER TABLE "elogo_invoices" RENAME TO "fiscal_invoices";

ALTER TABLE "fiscal_invoices" RENAME COLUMN "elogo_ref_id" TO "provider_ref";
ALTER TABLE "fiscal_invoices" RENAME COLUMN "elogo_result_code" TO "provider_result_code";
ALTER TABLE "fiscal_invoices" RENAME COLUMN "elogo_result_msg" TO "provider_result_msg";

ALTER TABLE "fiscal_invoices" RENAME CONSTRAINT "elogo_invoices_pkey" TO "fiscal_invoices_pkey";
ALTER TABLE "fiscal_invoices" RENAME CONSTRAINT "elogo_invoices_seller_user_id_fkey" TO "fiscal_invoices_seller_user_id_fkey";
ALTER TABLE "fiscal_invoices" RENAME CONSTRAINT "elogo_invoices_buyer_user_id_fkey" TO "fiscal_invoices_buyer_user_id_fkey";

ALTER INDEX "elogo_invoices_invoice_number_key" RENAME TO "fiscal_invoices_invoice_number_key";
ALTER INDEX "elogo_invoices_ettn_key" RENAME TO "fiscal_invoices_ettn_key";
ALTER INDEX "elogo_invoices_type_source_id_key" RENAME TO "fiscal_invoices_type_source_id_key";
ALTER INDEX "elogo_invoices_status_idx" RENAME TO "fiscal_invoices_status_idx";
ALTER INDEX "elogo_invoices_recipient_user_id_idx" RENAME TO "fiscal_invoices_recipient_user_id_idx";
ALTER INDEX "elogo_invoices_seller_user_id_idx" RENAME TO "fiscal_invoices_seller_user_id_idx";
ALTER INDEX "elogo_invoices_buyer_user_id_idx" RENAME TO "fiscal_invoices_buyer_user_id_idx";
ALTER INDEX "elogo_invoices_context_idx" RENAME TO "fiscal_invoices_context_idx";

-- Belgeyi kesen sağlayıcı
CREATE TYPE "EInvoiceProviderName" AS ENUM ('elogo', 'netsis');

ALTER TABLE "fiscal_invoices" ADD COLUMN "provider" "EInvoiceProviderName" NOT NULL DEFAULT 'elogo';

-- Numara sayacı
ALTER TABLE "elogo_doc_sequences" RENAME TO "fiscal_doc_sequences";

ALTER TABLE "fiscal_doc_sequences" RENAME CONSTRAINT "elogo_doc_sequences_pkey" TO "fiscal_doc_sequences_pkey";

ALTER INDEX "elogo_doc_sequences_prefix_year_key" RENAME TO "fiscal_doc_sequences_prefix_year_key";

COMMIT;
