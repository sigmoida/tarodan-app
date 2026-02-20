-- Add missing RatingStatus enum
CREATE TYPE "RatingStatus" AS ENUM ('pending', 'approved', 'rejected', 'spam');

-- Add missing DiscountType values
ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'bogo';
ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'bulk_quantity';

-- Add missing product_ratings columns
ALTER TABLE "product_ratings" ADD COLUMN "admin_reply" TEXT;
ALTER TABLE "product_ratings" ADD COLUMN "admin_reply_at" TIMESTAMP(3);
ALTER TABLE "product_ratings" ADD COLUMN "status" "RatingStatus" NOT NULL DEFAULT 'pending';

-- Add missing unique constraint on users.company_name
CREATE UNIQUE INDEX "users_company_name_key" ON "users"("company_name");

-- Add missing commission_rules indexes
CREATE INDEX "commission_rules_category_id_seller_type_is_active_idx" ON "commission_rules"("category_id", "seller_type", "is_active");
CREATE INDEX "commission_rules_seller_type_is_active_idx" ON "commission_rules"("seller_type", "is_active");
