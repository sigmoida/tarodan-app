-- Fix Advertisement Enum Types v2
-- Convert VARCHAR columns to proper PostgreSQL enums to match Prisma schema

BEGIN;

-- Create AdPosition enum if not exists
DO $$ 
BEGIN
    CREATE TYPE "AdPosition" AS ENUM ('header', 'sidebar', 'footer', 'inline', 'popup');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create AdDeviceType enum if not exists  
DO $$ 
BEGIN
    CREATE TYPE "AdDeviceType" AS ENUM ('desktop', 'mobile', 'all');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Step 1: Drop defaults first
ALTER TABLE advertisements ALTER COLUMN position DROP DEFAULT;
ALTER TABLE advertisements ALTER COLUMN device_type DROP DEFAULT;

-- Step 2: Ensure valid values
UPDATE advertisements SET position = 'header' WHERE position IS NULL OR position NOT IN ('header', 'sidebar', 'footer', 'inline', 'popup');
UPDATE advertisements SET device_type = 'all' WHERE device_type IS NULL OR device_type NOT IN ('desktop', 'mobile', 'all');

-- Step 3: Convert column types
ALTER TABLE advertisements ALTER COLUMN position TYPE "AdPosition" USING position::"AdPosition";
ALTER TABLE advertisements ALTER COLUMN device_type TYPE "AdDeviceType" USING device_type::"AdDeviceType";

-- Step 4: Set defaults back
ALTER TABLE advertisements ALTER COLUMN position SET DEFAULT 'header'::"AdPosition";
ALTER TABLE advertisements ALTER COLUMN device_type SET DEFAULT 'all'::"AdDeviceType";

COMMIT;

-- Verification
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'advertisements' 
AND column_name IN ('position', 'device_type');
