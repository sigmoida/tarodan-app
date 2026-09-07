-- PayTR geri dönen transfer listesi (/odeme/geri-donen-transfer) satırlarında bizim
-- trans_id'miz YOK; yalnız PayTR'nin kendi referansı (ref_no) var. O referans talimat
-- yanıtında `reference` olarak döner ve bugüne dek yalnız provider_response JSON'unda
-- duruyordu. Eşleme için ayrı, indeksli kolon.
ALTER TABLE "payout_transfers" ADD COLUMN "provider_reference" TEXT;

CREATE INDEX "payout_transfers_provider_reference_idx" ON "payout_transfers"("provider_reference");

-- Eski satırlar: talimat yanıtı bugüne dek provider_response'a olduğu gibi yazıldı;
-- `reference` oradaysa kolona taşı ki geri dönen transfer eşlemesi IBAN+tutar
-- sezgisine düşmesin. (returned satırlarda talimat yanıtı korunur; onlar da alır.)
UPDATE "payout_transfers"
SET "provider_reference" = "provider_response"->>'reference'
WHERE "provider_reference" IS NULL
  AND "status" IN ('completed', 'processing', 'returned')
  AND jsonb_typeof("provider_response") = 'object'
  AND NULLIF(btrim("provider_response"->>'reference'), '') IS NOT NULL;
