-- Refund financial policy v2 is intentionally additive. Legacy columns and
-- snapshots remain available during the dual-read/dual-write rollout.

CREATE TYPE "RefundFaultParty" AS ENUM ('buyer', 'seller', 'carrier', 'platform');
CREATE TYPE "RefundFinancialComponentCode" AS ENUM (
  'product',
  'outbound_shipping',
  'return_shipping',
  'buyer_commission',
  'buyer_platform_fee',
  'seller_commission',
  'seller_platform_fee'
);
CREATE TYPE "RefundFinancialTreatment" AS ENUM (
  'buyer_refund',
  'seller_refund',
  'buyer_charge',
  'seller_charge',
  'platform_retain',
  'platform_absorb'
);
CREATE TYPE "PackageShippingLeg" AS ENUM ('outbound', 'return');

ALTER TABLE "refund_requests"
  ADD COLUMN "resolved_reason" "RefundReason",
  ADD COLUMN "fault_party" "RefundFaultParty",
  ADD COLUMN "policy_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "policy_finalized_at" TIMESTAMP(3),
  ADD COLUMN "policy_finalized_by" TEXT,
  ADD COLUMN "financial_review_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outbound_package_tier" "ShippingPackageTierCode",
  ADD COLUMN "outbound_full_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_buyer_service_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_seller_service_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "retained_buyer_service_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "retained_seller_service_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "carrier_claim_required" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "commission_ledger"
  ADD COLUMN "buyer_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "buyer_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "seller_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "seller_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_buyer_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_buyer_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_seller_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_seller_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "component_breakdown_complete" BOOLEAN NOT NULL DEFAULT false;

-- The order row is the authoritative checkout-time four-way fee snapshot.
UPDATE "commission_ledger" AS cl
SET
  "buyer_commission_amount" = o."buyer_commission_amount",
  "buyer_platform_fee_amount" = o."buyer_service_fee_amount",
  "seller_commission_amount" = o."seller_commission_amount",
  "seller_platform_fee_amount" = o."seller_platform_fee_amount",
  "component_breakdown_complete" =
    ABS((o."buyer_commission_amount" + o."buyer_service_fee_amount") - cl."buyer_fee") <= 0.01
    AND ABS((o."seller_commission_amount" + o."seller_platform_fee_amount") - cl."seller_commission") <= 0.01
FROM "orders" AS o
WHERE o."id" = cl."order_id";

-- Preserve cumulative legacy reversals by allocating the aggregate reversal
-- over the original component basis. The second component receives the rounded
-- remainder so the four-way sum stays equal to the legacy aggregate.
UPDATE "commission_ledger"
SET
  "refunded_buyer_commission_amount" = LEAST(
    "buyer_commission_amount",
    CASE WHEN "buyer_fee" > 0
      THEN ROUND("refunded_buyer_fee" * "buyer_commission_amount" / "buyer_fee", 2)
      ELSE 0 END
  ),
  "refunded_buyer_platform_fee_amount" = LEAST(
    "buyer_platform_fee_amount",
    GREATEST(0, "refunded_buyer_fee" - LEAST(
      "buyer_commission_amount",
      CASE WHEN "buyer_fee" > 0
        THEN ROUND("refunded_buyer_fee" * "buyer_commission_amount" / "buyer_fee", 2)
        ELSE 0 END
    ))
  ),
  "refunded_seller_commission_amount" = LEAST(
    "seller_commission_amount",
    CASE WHEN "seller_commission" > 0
      THEN ROUND("refunded_seller_commission" * "seller_commission_amount" / "seller_commission", 2)
      ELSE 0 END
  ),
  "refunded_seller_platform_fee_amount" = LEAST(
    "seller_platform_fee_amount",
    GREATEST(0, "refunded_seller_commission" - LEAST(
      "seller_commission_amount",
      CASE WHEN "seller_commission" > 0
        THEN ROUND("refunded_seller_commission" * "seller_commission_amount" / "seller_commission", 2)
        ELSE 0 END
    ))
  )
WHERE "component_breakdown_complete" = true;

CREATE TABLE "refund_financial_components" (
  "id" TEXT NOT NULL,
  "refund_request_id" TEXT NOT NULL,
  "component_code" "RefundFinancialComponentCode" NOT NULL,
  "treatment" "RefundFinancialTreatment" NOT NULL,
  "net_amount" DECIMAL(10,2) NOT NULL,
  "tax_amount" DECIMAL(10,2) NOT NULL,
  "gross_amount" DECIMAL(10,2) NOT NULL,
  "source_amount" DECIMAL(10,2) NOT NULL,
  "quantity_portion" DECIMAL(8,6) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_financial_components_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_financial_components_amounts_check" CHECK (
    "net_amount" >= 0 AND "tax_amount" >= 0 AND "gross_amount" >= 0
    AND ABS(("net_amount" + "tax_amount") - "gross_amount") <= 0.01
  ),
  CONSTRAINT "refund_financial_components_portion_check" CHECK (
    "quantity_portion" >= 0 AND "quantity_portion" <= 1
  )
);

CREATE UNIQUE INDEX "refund_financial_components_refund_request_id_component_code_treatment_key"
  ON "refund_financial_components"("refund_request_id", "component_code", "treatment");
CREATE INDEX "refund_financial_components_refund_request_id_idx"
  ON "refund_financial_components"("refund_request_id");
ALTER TABLE "refund_financial_components"
  ADD CONSTRAINT "refund_financial_components_refund_request_id_fkey"
  FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "package_shipping_settlements" (
  "id" TEXT NOT NULL,
  "package_id" TEXT,
  "refund_request_id" TEXT NOT NULL,
  "leg" "PackageShippingLeg" NOT NULL,
  "payer" "RefundFaultParty" NOT NULL,
  "net_amount" DECIMAL(10,2) NOT NULL,
  "tax_amount" DECIMAL(10,2) NOT NULL,
  "gross_amount" DECIMAL(10,2) NOT NULL,
  "source_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_shipping_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_shipping_settlements_amounts_check" CHECK (
    "net_amount" >= 0 AND "tax_amount" >= 0 AND "gross_amount" >= 0
    AND ABS(("net_amount" + "tax_amount") - "gross_amount") <= 0.01
  )
);

CREATE UNIQUE INDEX "package_shipping_settlements_source_key_key"
  ON "package_shipping_settlements"("source_key");
CREATE UNIQUE INDEX "package_shipping_settlements_one_outbound_per_package_key"
  ON "package_shipping_settlements"("package_id")
  WHERE "leg" = 'outbound' AND "package_id" IS NOT NULL;
CREATE INDEX "package_shipping_settlements_package_id_leg_idx"
  ON "package_shipping_settlements"("package_id", "leg");
CREATE INDEX "package_shipping_settlements_refund_request_id_idx"
  ON "package_shipping_settlements"("refund_request_id");
ALTER TABLE "package_shipping_settlements"
  ADD CONSTRAINT "package_shipping_settlements_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "order_packages"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "package_shipping_settlements"
  ADD CONSTRAINT "package_shipping_settlements_refund_request_id_fkey"
  FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Completed records remain policy v1. Safe non-physical active records move to
-- the v2 decision queue; records with money-side effects stay quarantined v1.
--
-- IMPORTANT: once a return shipment is open/in transit/delivered, its status is
-- also a physical custody fact. Replacing that state with pending_review would
-- make the request cancellable and could release the seller hold after the
-- buyer handed the parcel to the carrier. Those records receive the v2 review
-- marker below, but their lifecycle status is deliberately preserved.
UPDATE "refund_requests" AS rr
SET
  "policy_version" = 2,
  "financial_review_required" = true,
  "status" = 'pending_review',
  "metadata" = COALESCE(rr."metadata", '{}'::jsonb) || jsonb_build_object(
    'migration', jsonb_build_object('fromPolicyVersion', 1, 'requiresV2Decision', true)
  )
WHERE rr."status" NOT IN ('refunded', 'rejected', 'cancelled')
  AND rr."status" NOT IN ('return_shipment_open', 'return_in_transit', 'return_delivered', 'disputed')
  AND rr."refunded_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "refund_attempts" ra
    WHERE ra."order_id" = rr."order_id" AND ra."status" IN ('succeeded', 'finalized')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "seller_account_adjustments" saa
    WHERE saa."refund_request_id" = rr."id"
  );

-- Safe records whose physical return has already started can still adopt v2,
-- but only an admin financial decision may finalize their component snapshot.
-- No lifecycle column is written in this UPDATE.
UPDATE "refund_requests" AS rr
SET
  "policy_version" = 2,
  "financial_review_required" = true,
  "metadata" = COALESCE(rr."metadata", '{}'::jsonb) || jsonb_build_object(
    'migration', jsonb_build_object(
      'fromPolicyVersion', 1,
      'requiresV2Decision', true,
      'lifecyclePreserved', true
    )
  )
WHERE rr."status" IN ('return_shipment_open', 'return_in_transit', 'return_delivered', 'disputed')
  AND rr."refunded_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "refund_attempts" ra
    WHERE ra."order_id" = rr."order_id" AND ra."status" IN ('succeeded', 'finalized')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "seller_account_adjustments" saa
    WHERE saa."refund_request_id" = rr."id"
  );

UPDATE "refund_requests" AS rr
SET
  "financial_review_required" = true,
  "metadata" = COALESCE(rr."metadata", '{}'::jsonb) || jsonb_build_object(
    'migration', jsonb_build_object(
      'fromPolicyVersion', 1,
      'quarantined', true,
      'reason', 'existing_financial_side_effect'
    )
  )
WHERE rr."status" NOT IN ('refunded', 'rejected', 'cancelled')
  AND (
    rr."refunded_at" IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM "refund_attempts" ra
      WHERE ra."order_id" = rr."order_id" AND ra."status" IN ('succeeded', 'finalized')
    )
    OR EXISTS (
      SELECT 1 FROM "seller_account_adjustments" saa
      WHERE saa."refund_request_id" = rr."id"
    )
  );

-- Financial components are append-only. Corrections require a new refund
-- decision, never mutation of an approved snapshot.
CREATE OR REPLACE FUNCTION prevent_refund_financial_component_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'refund financial components are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refund_financial_components_no_update
BEFORE UPDATE OR DELETE ON "refund_financial_components"
FOR EACH ROW EXECUTE FUNCTION prevent_refund_financial_component_mutation();

CREATE TRIGGER package_shipping_settlements_no_update
BEFORE UPDATE OR DELETE ON "package_shipping_settlements"
FOR EACH ROW EXECUTE FUNCTION prevent_refund_financial_component_mutation();

CREATE OR REPLACE FUNCTION prevent_finalized_refund_policy_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."policy_finalized_at" IS NOT NULL AND (
    NEW."financial_policy_snapshot" IS DISTINCT FROM OLD."financial_policy_snapshot"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."resolved_reason" IS DISTINCT FROM OLD."resolved_reason"
    OR NEW."fault_party" IS DISTINCT FROM OLD."fault_party"
    OR NEW."policy_version" IS DISTINCT FROM OLD."policy_version"
    OR NEW."policy_finalized_at" IS DISTINCT FROM OLD."policy_finalized_at"
    OR NEW."policy_finalized_by" IS DISTINCT FROM OLD."policy_finalized_by"
    OR NEW."outbound_package_tier" IS DISTINCT FROM OLD."outbound_package_tier"
    OR NEW."outbound_full_shipping_amount" IS DISTINCT FROM OLD."outbound_full_shipping_amount"
  ) THEN
    RAISE EXCEPTION 'finalized refund financial policy is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refund_requests_finalized_policy_no_update
BEFORE UPDATE ON "refund_requests"
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_refund_policy_mutation();
