CREATE TYPE "OrderCancellationReason" AS ENUM (
  'delivery_delayed',
  'wrong_product_selected',
  'changed_mind',
  'wrong_card',
  'price_changed_mind',
  'unavailable_at_address',
  'other'
);

ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'defective';
ALTER TYPE "RefundReason" ADD VALUE IF NOT EXISTS 'buyer_damaged';

ALTER TABLE "orders"
  ADD COLUMN "cancellation_reason_code" "OrderCancellationReason",
  ADD COLUMN "cancellation_policy_snapshot" JSONB;

ALTER TABLE "refund_requests"
  ADD COLUMN "policy_code" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "financial_policy_snapshot" JSONB,
  ADD COLUMN "return_billable_desi" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "return_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_product_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_outbound_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_buyer_protection_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_seller_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "retained_seller_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "return_shipping_charge_to_buyer" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "return_shipping_charge_to_seller" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "requires_admin_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "penalty_review_required" BOOLEAN NOT NULL DEFAULT false;

UPDATE "refund_requests"
SET
  "refunded_product_amount" = "amount",
  "financial_policy_snapshot" = jsonb_build_object(
    'version', 0,
    'policyCode', 'legacy',
    'buyerRefundAmount', "amount"
  );
