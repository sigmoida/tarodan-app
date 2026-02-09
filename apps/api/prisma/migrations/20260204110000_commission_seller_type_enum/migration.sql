-- commission_rules.seller_type was created as SellerType (individual, verified, platform).
-- Schema expects CommissionSellerType (FREE, PREMIUM, BUSINESS, ALL). Create enum and alter column.

DO $$ BEGIN
  CREATE TYPE "CommissionSellerType" AS ENUM ('FREE', 'PREMIUM', 'BUSINESS', 'ALL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Convert seller_type from SellerType to CommissionSellerType (map old values to new)
ALTER TABLE "commission_rules" ALTER COLUMN "seller_type" TYPE text USING (CASE
  WHEN seller_type::text = 'individual' THEN 'FREE'
  WHEN seller_type::text = 'verified' THEN 'PREMIUM'
  WHEN seller_type::text = 'platform' THEN 'BUSINESS'
  ELSE 'ALL'
END);
ALTER TABLE "commission_rules" ALTER COLUMN "seller_type" TYPE "CommissionSellerType" USING seller_type::"CommissionSellerType";
