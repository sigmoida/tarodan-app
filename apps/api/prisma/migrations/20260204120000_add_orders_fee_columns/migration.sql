-- Add buyer_fee_amount and seller_fee_amount to orders (schema has them, DB was missing)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "buyer_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
