-- PayTR geri dönen transfer listesi (/odeme/geri-donen-transfer) satırlarında bizim
-- trans_id'miz YOK; yalnız PayTR'nin kendi referansı (ref_no) var. O referans talimat
-- yanıtında `reference` olarak döner ve bugüne dek yalnız provider_response JSON'unda
-- duruyordu. Eşleme için ayrı, indeksli kolon.
ALTER TABLE "payout_transfers" ADD COLUMN "provider_reference" TEXT;

CREATE INDEX "payout_transfers_provider_reference_idx" ON "payout_transfers"("provider_reference");
