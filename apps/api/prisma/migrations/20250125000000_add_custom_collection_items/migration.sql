-- AlterTable
ALTER TABLE "collection_items" 
  ALTER COLUMN "product_id" DROP NOT NULL;

-- Add custom product columns
ALTER TABLE "collection_items" 
  ADD COLUMN IF NOT EXISTS "custom_title" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_description" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_brand" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_model" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "custom_scale" TEXT,
  ADD COLUMN IF NOT EXISTS "custom_image_url" TEXT;

-- Drop the existing unique constraint if it exists
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'collection_items_collection_id_product_id_key'
  ) THEN
    ALTER TABLE "collection_items" DROP CONSTRAINT "collection_items_collection_id_product_id_key";
  END IF;
END $$;

-- Recreate unique constraint only for non-null productId (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'collection_items_collection_id_product_id_key'
  ) THEN
    CREATE UNIQUE INDEX "collection_items_collection_id_product_id_key" 
      ON "collection_items"("collection_id", "product_id") 
      WHERE "product_id" IS NOT NULL;
  END IF;
END $$;

-- Add index on collection_id if not exists
CREATE INDEX IF NOT EXISTS "collection_items_collection_id_idx" ON "collection_items"("collection_id");
