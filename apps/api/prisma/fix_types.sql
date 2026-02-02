-- =====================================================
-- FIX ENUM TYPE MISMATCH
-- Convert enum columns to TEXT to avoid type conflicts
-- =====================================================

-- Drop the seller_type column and recreate as TEXT
ALTER TABLE "commission_rules" DROP COLUMN IF EXISTS "seller_type";
ALTER TABLE "commission_rules" ADD COLUMN "seller_type" TEXT;

-- Ensure orders has the fee columns
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
