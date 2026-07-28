ALTER TABLE "membership_payments"
  ADD COLUMN "order_id" TEXT,
  ADD COLUMN "target_tier_id" TEXT,
  ADD COLUMN "billing_period" TEXT,
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "membership_payments_order_id_key"
  ON "membership_payments"("order_id");
CREATE UNIQUE INDEX "membership_payments_idempotency_key_key"
  ON "membership_payments"("idempotency_key");
CREATE INDEX "membership_payments_membership_id_status_idx"
  ON "membership_payments"("membership_id", "status");
CREATE INDEX "membership_payments_target_tier_id_idx"
  ON "membership_payments"("target_tier_id");

ALTER TABLE "membership_payments"
  ADD CONSTRAINT "membership_payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "membership_payments"
  ADD CONSTRAINT "membership_payments_target_tier_id_fkey"
  FOREIGN KEY ("target_tier_id") REFERENCES "membership_tiers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
