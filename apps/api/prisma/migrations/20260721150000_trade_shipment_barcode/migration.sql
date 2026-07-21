-- Trade shipments now create the REAL Sürat cargo code (KargoTakipNo) + ZPL
-- label at trade approval/dispatch (OrtakBarkodOlustur), mirroring orders.
-- trackingNumber stays our OzelKargoTakipNo (the poller's query ref).
ALTER TABLE "trade_shipments" ADD COLUMN "provider_tracking_id" TEXT;
ALTER TABLE "trade_shipments" ADD COLUMN "label_zpl" TEXT;
