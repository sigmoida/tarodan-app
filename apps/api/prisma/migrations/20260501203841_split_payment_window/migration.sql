-- Split payment window: 30-min stock reservation + 24h order payment TTL.
-- Reservation release flag is nullable; payment-expiry is NOT NULL but we
-- backfill existing rows: pending_payment keeps old 30-min contract,
-- terminal-state rows get a meaningless value (createdAt) since no cron
-- looks at them.

ALTER TABLE "orders" ADD COLUMN "reservation_released_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" TIMESTAMP(3);

UPDATE "orders"
SET "payment_expires_at" = CASE
  WHEN "status" = 'pending_payment' THEN "created_at" + INTERVAL '30 minutes'
  ELSE "created_at"
END;

ALTER TABLE "orders" ALTER COLUMN "payment_expires_at" SET NOT NULL;

CREATE INDEX "orders_status_payment_expires_at_idx"
  ON "orders"("status", "payment_expires_at");
