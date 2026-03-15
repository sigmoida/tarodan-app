-- AlterTable
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "custom_manufacturer" TEXT;
ALTER TABLE "collection_items" ADD COLUMN IF NOT EXISTS "custom_material" TEXT;
