-- Trade cancel hardening: track first warehouse arrival + admin reject refund failures.

ALTER TABLE "trades" ADD COLUMN "first_warehouse_arrival_at" TIMESTAMP(3);
ALTER TABLE "trades" ADD COLUMN "cancel_locked_at" TIMESTAMP(3);
ALTER TABLE "trades" ADD COLUMN "refund_failure_reason" TEXT;
ALTER TABLE "trades" ADD COLUMN "refund_failure_at" TIMESTAMP(3);

-- Backfill: for trades that have already moved past shipping_to_warehouse,
-- stamp first_warehouse_arrival_at from the earliest delivered to_warehouse
-- shipment so the new cancel guard reflects historical state.
UPDATE "trades" t
SET "first_warehouse_arrival_at" = sub.first_delivered
FROM (
  SELECT trade_id, MIN(delivered_at) AS first_delivered
  FROM "trade_shipments"
  WHERE leg = 'to_warehouse' AND delivered_at IS NOT NULL
  GROUP BY trade_id
) sub
WHERE t.id = sub.trade_id
  AND t.status IN (
    'at_warehouse',
    'admin_reviewing',
    'shipping_to_recipients',
    'returning',
    'completed'
  );

UPDATE "trades"
SET "cancel_locked_at" = "first_warehouse_arrival_at"
WHERE "first_warehouse_arrival_at" IS NOT NULL;
