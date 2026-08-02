-- Explicit marker for "delivery revenue invoices have been issued for this order".
-- The backfill cron used to scan every delivered/completed order (unordered,
-- LIMIT 500) because the only signal was derived from elogo_invoices rows.
-- Completed orders never left that candidate set, so once the platform passed 500
-- lifetime delivered orders the window could permanently exclude newer
-- deliveries, leaving them invoiced 14 days late or not at all.
ALTER TABLE "orders" ADD COLUMN "revenue_invoiced_at" TIMESTAMP(3);

CREATE INDEX "orders_status_revenue_invoiced_at_delivered_at_idx"
  ON "orders" ("status", "revenue_invoiced_at", "delivered_at");

-- Backfill: orders that already carry a delivery revenue invoice are marked so the
-- first run after deploy does not re-attempt the entire history. Conservative —
-- only stamped when an invoice row actually exists.
UPDATE "orders" AS o
SET "revenue_invoiced_at" = NOW()
WHERE o."status" IN ('delivered', 'completed')
  AND EXISTS (
    SELECT 1
    FROM "elogo_invoices" ei
    WHERE ei."source_id" = o."id"
      AND ei."type" IN ('commission', 'service_fee', 'platform_sale')
  );
