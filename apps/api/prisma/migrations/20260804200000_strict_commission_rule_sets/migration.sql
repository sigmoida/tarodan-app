-- Test-environment clean cutover: legacy commission rules are intentionally
-- discarded. No data backfill is performed.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS "commission_rule_shipping_shares" CASCADE;
DROP TABLE IF EXISTS "commission_rules" CASCADE;

DROP TYPE IF EXISTS "CommissionSellerType";
CREATE TYPE "CommissionSellerType" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'BUSINESS');

CREATE TYPE "CommissionRuleSetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE "commission_rule_sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CommissionRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commission_rule_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "rule_set_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "seller_type" "CommissionSellerType" NOT NULL,
    "min_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_amount" DECIMAL(12,2),
    "buyer_commission_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "buyer_commission_min" DECIMAL(10,2),
    "buyer_commission_max" DECIMAL(10,2),
    "buyer_service_fee_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "buyer_service_fee_min" DECIMAL(10,2),
    "buyer_service_fee_max" DECIMAL(10,2),
    "seller_commission_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "seller_commission_min" DECIMAL(10,2),
    "seller_commission_max" DECIMAL(10,2),
    "seller_platform_fee_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "seller_platform_fee_min" DECIMAL(10,2),
    "seller_platform_fee_max" DECIMAL(10,2),
    "trade_fee_seller_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "trade_fee_buyer_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shipping_buyer_share" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commission_rules_amount_check" CHECK (
      "min_amount" >= 0 AND ("max_amount" IS NULL OR "max_amount" > "min_amount")
    ),
    CONSTRAINT "commission_rules_rate_check" CHECK (
      "buyer_commission_rate" BETWEEN 0 AND 100 AND
      "buyer_service_fee_rate" BETWEEN 0 AND 100 AND
      "seller_commission_rate" BETWEEN 0 AND 100 AND
      "seller_platform_fee_rate" BETWEEN 0 AND 100
    ),
    CONSTRAINT "commission_rules_trade_fee_check" CHECK (
      "trade_fee_seller_amount" >= 0 AND "trade_fee_buyer_amount" >= 0
    ),
    CONSTRAINT "commission_rules_shipping_share_check" CHECK (
      "shipping_buyer_share" BETWEEN 0 AND 100
    ),
    CONSTRAINT "commission_rules_fee_bounds_check" CHECK (
      ("buyer_commission_min" IS NULL OR "buyer_commission_min" >= 0) AND
      ("buyer_commission_max" IS NULL OR "buyer_commission_max" >= 0) AND
      ("buyer_commission_min" IS NULL OR "buyer_commission_max" IS NULL OR "buyer_commission_max" >= "buyer_commission_min") AND
      ("buyer_service_fee_min" IS NULL OR "buyer_service_fee_min" >= 0) AND
      ("buyer_service_fee_max" IS NULL OR "buyer_service_fee_max" >= 0) AND
      ("buyer_service_fee_min" IS NULL OR "buyer_service_fee_max" IS NULL OR "buyer_service_fee_max" >= "buyer_service_fee_min") AND
      ("seller_commission_min" IS NULL OR "seller_commission_min" >= 0) AND
      ("seller_commission_max" IS NULL OR "seller_commission_max" >= 0) AND
      ("seller_commission_min" IS NULL OR "seller_commission_max" IS NULL OR "seller_commission_max" >= "seller_commission_min") AND
      ("seller_platform_fee_min" IS NULL OR "seller_platform_fee_min" >= 0) AND
      ("seller_platform_fee_max" IS NULL OR "seller_platform_fee_max" >= 0) AND
      ("seller_platform_fee_min" IS NULL OR "seller_platform_fee_max" IS NULL OR "seller_platform_fee_max" >= "seller_platform_fee_min")
    ),
    CONSTRAINT "commission_rules_zero_rate_bounds_check" CHECK (
      ("buyer_commission_rate" <> 0 OR (COALESCE("buyer_commission_min", 0) = 0 AND COALESCE("buyer_commission_max", 0) = 0)) AND
      ("buyer_service_fee_rate" <> 0 OR (COALESCE("buyer_service_fee_min", 0) = 0 AND COALESCE("buyer_service_fee_max", 0) = 0)) AND
      ("seller_commission_rate" <> 0 OR (COALESCE("seller_commission_min", 0) = 0 AND COALESCE("seller_commission_max", 0) = 0)) AND
      ("seller_platform_fee_rate" <> 0 OR (COALESCE("seller_platform_fee_min", 0) = 0 AND COALESCE("seller_platform_fee_max", 0) = 0))
    )
);

CREATE TABLE "commission_rule_shipping_shares" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "tier_code" "ShippingPackageTierCode" NOT NULL,
    "buyer_share" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commission_rule_shipping_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commission_shipping_share_check" CHECK ("buyer_share" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "commission_rule_sets_version_key" ON "commission_rule_sets"("version");
CREATE INDEX "commission_rule_sets_status_idx" ON "commission_rule_sets"("status");
CREATE UNIQUE INDEX "commission_rule_sets_one_active_idx"
  ON "commission_rule_sets"("status") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "commission_rule_sets_one_draft_idx"
  ON "commission_rule_sets"("status") WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "commission_rules_rule_set_id_category_id_seller_type_min_key"
  ON "commission_rules"("rule_set_id", "category_id", "seller_type", "min_amount");
CREATE INDEX "commission_rules_rule_set_id_category_id_seller_type_idx"
  ON "commission_rules"("rule_set_id", "category_id", "seller_type");

ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_no_overlap"
  EXCLUDE USING gist (
    "rule_set_id" WITH =,
    "category_id" WITH =,
    "seller_type" WITH =,
    numrange("min_amount", "max_amount", '[)') WITH &&
  ) DEFERRABLE INITIALLY IMMEDIATE;

CREATE UNIQUE INDEX "commission_rule_shipping_shares_rule_id_tier_code_key"
  ON "commission_rule_shipping_shares"("rule_id", "tier_code");
CREATE INDEX "commission_rule_shipping_shares_rule_id_idx"
  ON "commission_rule_shipping_shares"("rule_id");

ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_rule_set_id_fkey"
  FOREIGN KEY ("rule_set_id") REFERENCES "commission_rule_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission_rule_shipping_shares" ADD CONSTRAINT "commission_rule_shipping_shares_rule_id_fkey"
  FOREIGN KEY ("rule_id") REFERENCES "commission_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The old selector enums are no longer used by the strict model.
DROP TYPE IF EXISTS "CommissionRuleType";
DROP TYPE IF EXISTS "CommissionAppliesTo";
DROP TYPE IF EXISTS "CommissionTaxpayerType";
