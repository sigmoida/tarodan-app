-- Add ALL missing columns for commission_rules table
-- Based on schema.prisma lines 1286-1318

-- New fields (satır 1302-1309)
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "applies_to" TEXT NOT NULL DEFAULT 'SELLER';
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_rate" DECIMAL(5, 4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_rate" DECIMAL(5, 4);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_min" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_max" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_min" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "buyer_max" DECIMAL(10, 2);

-- Legacy fields (satır 1291-1296)
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "seller_type" TEXT;
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "membership_tier" TEXT;
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "min_amount" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "min_commission" DECIMAL(10, 2);
ALTER TABLE "commission_rules" ADD COLUMN IF NOT EXISTS "max_commission" DECIMAL(10, 2);

-- Users table missing columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);
