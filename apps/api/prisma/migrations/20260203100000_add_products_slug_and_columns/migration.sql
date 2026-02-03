-- AlterTable: Add missing Product columns (schema vs DB drift fix)
-- products.slug was missing -> product list/collection queries failed with "column products.slug does not exist"

-- Slug: nullable, unique (SEO-friendly URL; legacy compatibility)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "slug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_key" ON "products"("slug");

-- Like count (default 0)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "like_count" INTEGER NOT NULL DEFAULT 0;

-- Quantity & max per order (nullable)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "max_quantity_per_order" INTEGER;

-- Popularity (scoring)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "popularity_score" INTEGER;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "popularity_updated_at" TIMESTAMP(3);
