-- AlterTable: Phase 2 carrier-cost reconciliation fields on the shipment. Surat
-- returns these on every tracking poll (Tutar / TutarKdvsiz / KdvTutar / ToplamDesiKg)
-- but they were dropped; capture them to compare charged shipping vs true carrier cost.
ALTER TABLE "shipments"
  ADD COLUMN "quoted_carrier_cost" DECIMAL(10,2),
  ADD COLUMN "carrier_actual_cost" DECIMAL(10,2),
  ADD COLUMN "carrier_net_cost" DECIMAL(10,2),
  ADD COLUMN "carrier_tax_amount" DECIMAL(10,2),
  ADD COLUMN "carrier_desi" DECIMAL(10,3),
  ADD COLUMN "carrier_cost_synced_at" TIMESTAMP(3);
