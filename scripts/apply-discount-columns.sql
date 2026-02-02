-- Apply discount-system columns and tables if not present.
-- Run against your PostgreSQL DB (e.g. psql $DATABASE_URL -f scripts/apply-discount-columns.sql)
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).

-- Enums (ignore if exist)
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('percentage', 'fixed_amount');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "DiscountScope" AS ENUM ('global', 'category', 'product', 'seller');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Products: sale/discount columns
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "original_price" DECIMAL(10,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_price" DECIMAL(10,2);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_start_date" TIMESTAMP(3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_end_date" TIMESTAMP(3);

-- Orders: discount columns
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_code" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_breakdown" JSONB;

-- Create index on products if not exists (PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS "products_sale_start_date_sale_end_date_idx"
  ON "products"("sale_start_date", "sale_end_date");
