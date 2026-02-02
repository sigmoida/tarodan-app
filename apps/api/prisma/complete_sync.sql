-- =====================================================
-- COMPLETE DATABASE SYNC SCRIPT
-- Add all missing columns and enums
-- =====================================================

-- 1. Create missing enum types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionSellerType') THEN
        CREATE TYPE "CommissionSellerType" AS ENUM ('FREE', 'PREMIUM', 'BUSINESS', 'ALL');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionAppliesTo') THEN
        CREATE TYPE "CommissionAppliesTo" AS ENUM ('SELLER', 'BUYER', 'BOTH');
    END IF;
END $$;

-- 2. Orders table - buyer/seller fee columns
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- 3. Users table - missing columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT;

-- 4. Commission rules table - ALL missing columns
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "applies_to" TEXT NOT NULL DEFAULT 'SELLER';
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_rate" DECIMAL(5, 4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_rate" DECIMAL(5, 4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_min" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_max" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_min" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_max" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_type" TEXT;
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "membership_tier" TEXT;
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "min_amount" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "min_commission" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "max_commission" DECIMAL(10, 2);
