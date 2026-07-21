-- Store the raw ZPL label returned by Sürat OrtakBarkodOlustur (for future
-- printing). The real cargo code (KargoTakipNo) already has a home in
-- provider_tracking_id; this only adds the label payload.
ALTER TABLE "shipments" ADD COLUMN "label_zpl" TEXT;
