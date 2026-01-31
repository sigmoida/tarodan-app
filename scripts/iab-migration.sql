-- IAB Advertisements Enhancement Migration

-- Create enums if not exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdDeviceType') THEN
    CREATE TYPE "AdDeviceType" AS ENUM ('desktop', 'mobile', 'all');
  END IF;
END $$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdPosition') THEN
    CREATE TYPE "AdPosition" AS ENUM ('header', 'sidebar', 'footer', 'inline', 'popup');
  END IF;
END $$;

-- Add new columns to advertisements table
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "alt_text" TEXT;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "advertisements" ADD COLUMN IF NOT EXISTS "device_type" TEXT DEFAULT 'all';

-- Update existing position values (convert 'top' to 'header')
UPDATE "advertisements" SET "position" = 'header' WHERE "position" = 'top';
