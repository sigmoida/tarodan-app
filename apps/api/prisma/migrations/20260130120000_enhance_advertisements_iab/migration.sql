-- CreateEnum
CREATE TYPE "AdDeviceType" AS ENUM ('desktop', 'mobile', 'all');

-- CreateEnum  
CREATE TYPE "AdPosition" AS ENUM ('header', 'sidebar', 'footer', 'inline', 'popup');

-- AlterTable - Add new columns
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "alt_text" TEXT;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "device_type" "AdDeviceType" NOT NULL DEFAULT 'all';

-- Convert existing position values to new enum
-- First, add temporary column
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "position_new" "AdPosition";

-- Map old string values to new enum
UPDATE "advertisements" SET "position_new" = 
  CASE 
    WHEN "position" = 'top' THEN 'header'::"AdPosition"
    WHEN "position" = 'header' THEN 'header'::"AdPosition"
    WHEN "position" = 'sidebar' THEN 'sidebar'::"AdPosition"
    WHEN "position" = 'footer' THEN 'footer'::"AdPosition"
    WHEN "position" = 'inline' THEN 'inline'::"AdPosition"
    WHEN "position" = 'popup' THEN 'popup'::"AdPosition"
    ELSE 'header'::"AdPosition"
  END;

-- Drop old column and rename new one
ALTER TABLE "advertisements" DROP COLUMN IF EXISTS "position";
ALTER TABLE "advertisements" RENAME COLUMN "position_new" TO "position";

-- Set default for position
ALTER TABLE "advertisements" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "advertisements" ALTER COLUMN "position" SET DEFAULT 'header'::"AdPosition";

-- Drop old index and create new one
DROP INDEX IF EXISTS "advertisements_position_is_active_idx";
CREATE INDEX "advertisements_position_device_type_is_active_idx" ON "advertisements"("position", "device_type", "is_active");
