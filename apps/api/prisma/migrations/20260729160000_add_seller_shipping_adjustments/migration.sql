CREATE TYPE "SellerAdjustmentType" AS ENUM ('return_shipping');
CREATE TYPE "SellerAdjustmentStatus" AS ENUM ('open', 'settled');

ALTER TABLE "payout_transfers"
  ADD COLUMN "adjustment_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "seller_account_adjustments" (
  "id" TEXT NOT NULL,
  "seller_id" TEXT NOT NULL,
  "order_id" TEXT,
  "refund_request_id" TEXT,
  "source_key" TEXT NOT NULL,
  "type" "SellerAdjustmentType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "remaining_amount" DECIMAL(10,2) NOT NULL,
  "status" "SellerAdjustmentStatus" NOT NULL DEFAULT 'open',
  "metadata" JSONB,
  "settled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "seller_account_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seller_adjustment_applications" (
  "id" TEXT NOT NULL,
  "adjustment_id" TEXT NOT NULL,
  "payout_transfer_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_adjustment_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_account_adjustments_source_key_key"
  ON "seller_account_adjustments"("source_key");
CREATE INDEX "seller_account_adjustments_seller_id_status_created_at_idx"
  ON "seller_account_adjustments"("seller_id", "status", "created_at");
CREATE INDEX "seller_account_adjustments_order_id_idx"
  ON "seller_account_adjustments"("order_id");
CREATE INDEX "seller_account_adjustments_refund_request_id_idx"
  ON "seller_account_adjustments"("refund_request_id");
CREATE UNIQUE INDEX "seller_adjustment_applications_adjustment_id_payout_transfer_id_key"
  ON "seller_adjustment_applications"("adjustment_id", "payout_transfer_id");
CREATE INDEX "seller_adjustment_applications_payout_transfer_id_idx"
  ON "seller_adjustment_applications"("payout_transfer_id");

ALTER TABLE "seller_adjustment_applications"
  ADD CONSTRAINT "seller_adjustment_applications_adjustment_id_fkey"
  FOREIGN KEY ("adjustment_id") REFERENCES "seller_account_adjustments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seller_adjustment_applications"
  ADD CONSTRAINT "seller_adjustment_applications_payout_transfer_id_fkey"
  FOREIGN KEY ("payout_transfer_id") REFERENCES "payout_transfers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seller_account_adjustments"
  ADD CONSTRAINT "seller_account_adjustments_amount_check"
  CHECK ("amount" > 0 AND "remaining_amount" >= 0 AND "remaining_amount" <= "amount");
ALTER TABLE "payout_transfers"
  ADD CONSTRAINT "payout_transfers_adjustment_deduction_check"
  CHECK ("adjustment_deduction" >= 0);
