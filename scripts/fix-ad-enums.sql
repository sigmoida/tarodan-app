-- Fix Advertisement Enum Types
-- Convert VARCHAR columns to proper PostgreSQL enums to match Prisma schema

BEGIN;

-- Create AdPosition enum if not exists
DO $$ 
BEGIN
    CREATE TYPE "AdPosition" AS ENUM ('header', 'sidebar', 'footer', 'inline', 'popup');
EXCEPTION
    WHEN duplicate_object THEN 
        -- Type already exists, that's fine
        NULL;
END $$;

-- Create AdDeviceType enum if not exists  
DO $$ 
BEGIN
    CREATE TYPE "AdDeviceType" AS ENUM ('desktop', 'mobile', 'all');
EXCEPTION
    WHEN duplicate_object THEN 
        -- Type already exists, that's fine
        NULL;
END $$;

-- Check current column types and convert if needed
DO $$
DECLARE
    pos_type text;
    dev_type text;
BEGIN
    -- Get current position column type
    SELECT data_type INTO pos_type 
    FROM information_schema.columns 
    WHERE table_name = 'advertisements' AND column_name = 'position';
    
    -- Get current device_type column type
    SELECT data_type INTO dev_type 
    FROM information_schema.columns 
    WHERE table_name = 'advertisements' AND column_name = 'device_type';
    
    -- Convert position column to enum if it's varchar/text
    IF pos_type IN ('character varying', 'text') THEN
        -- Ensure valid values before conversion
        UPDATE advertisements SET position = 'header' WHERE position IS NULL OR position NOT IN ('header', 'sidebar', 'footer', 'inline', 'popup');
        
        -- Convert column type
        ALTER TABLE advertisements 
            ALTER COLUMN position TYPE "AdPosition" 
            USING position::"AdPosition";
            
        -- Set default
        ALTER TABLE advertisements 
            ALTER COLUMN position SET DEFAULT 'header'::"AdPosition";
    END IF;
    
    -- Convert device_type column to enum if it's varchar/text
    IF dev_type IN ('character varying', 'text') THEN
        -- Ensure valid values before conversion
        UPDATE advertisements SET device_type = 'all' WHERE device_type IS NULL OR device_type NOT IN ('desktop', 'mobile', 'all');
        
        -- Convert column type
        ALTER TABLE advertisements 
            ALTER COLUMN device_type TYPE "AdDeviceType" 
            USING device_type::"AdDeviceType";
            
        -- Set default
        ALTER TABLE advertisements 
            ALTER COLUMN device_type SET DEFAULT 'all'::"AdDeviceType";
    END IF;
END $$;

COMMIT;

-- Verification
SELECT column_name, data_type, udt_name
FROM information_schema.columns 
WHERE table_name = 'advertisements' 
AND column_name IN ('position', 'device_type');
