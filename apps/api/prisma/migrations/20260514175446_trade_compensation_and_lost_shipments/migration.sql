-- Trade compensation flag (set when an admin declares a return shipment lost)
-- and TradeShipment lost markers used by the same flow.

ALTER TABLE "trades" ADD COLUMN "compensation_pending_user_id" UUID;
ALTER TABLE "trades" ADD COLUMN "compensation_resolved_at" TIMESTAMP(3);

ALTER TABLE "trade_shipments" ADD COLUMN "lost_at" TIMESTAMP(3);
ALTER TABLE "trade_shipments" ADD COLUMN "lost_reason" TEXT;

CREATE INDEX "trades_compensation_pending_user_id_idx"
  ON "trades"("compensation_pending_user_id")
  WHERE "compensation_pending_user_id" IS NOT NULL;
