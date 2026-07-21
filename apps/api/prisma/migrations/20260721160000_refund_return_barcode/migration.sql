-- Refund return shipments now create the REAL Sürat cargo code (KargoTakipNo)
-- + ZPL label at open (OrtakBarkodOlustur), mirroring orders/trades.
-- return_tracking_number stays our OzelKargoTakipNo (= refundNumber, poll ref).
ALTER TABLE "refund_requests" ADD COLUMN "return_provider_tracking_id" TEXT;
ALTER TABLE "refund_requests" ADD COLUMN "return_label_zpl" TEXT;
