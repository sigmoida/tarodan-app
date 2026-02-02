-- AlterTable: Add old_price to products (A + oldPrice: price = current selling price, oldPrice = previous for strike-through and restore)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "old_price" DECIMAL(10,2);

-- Migrate existing sale data: make price (A) = sale price, old_price = original price
UPDATE "products"
SET price = sale_price, old_price = original_price
WHERE sale_price IS NOT NULL AND original_price IS NOT NULL;
