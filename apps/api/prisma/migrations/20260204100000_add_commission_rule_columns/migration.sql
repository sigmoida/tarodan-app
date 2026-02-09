-- Add missing CommissionRule columns: applies_to, seller_rate, buyer_rate, seller_min, seller_max, buyer_min, buyer_max
-- Schema: CommissionAppliesTo enum and extended commission fields

-- CreateEnum (only if not exists - safe for re-run)
DO $$ BEGIN
  CREATE TYPE "CommissionAppliesTo" AS ENUM ('SELLER', 'BUYER', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add applies_to column
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "applies_to" "CommissionAppliesTo" NOT NULL DEFAULT 'SELLER';

-- Add nullable decimal columns for seller/buyer rates and min/max
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_rate" DECIMAL(5,4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_rate" DECIMAL(5,4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_min" DECIMAL(10,2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_max" DECIMAL(10,2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_min" DECIMAL(10,2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_max" DECIMAL(10,2);
