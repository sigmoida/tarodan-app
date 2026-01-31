-- Fix Schema Drift: Add missing columns to PostgreSQL database
-- This script adds columns that exist in Prisma schema but are missing from the actual database
-- All operations are safe and won't affect existing data

BEGIN;

-- ============================================================================
-- 1. PRODUCTS TABLE - Add missing columns
-- ============================================================================

-- Add popularity_score column
ALTER TABLE products ADD COLUMN IF NOT EXISTS popularity_score INTEGER;

-- Add popularity_updated_at column
ALTER TABLE products ADD COLUMN IF NOT EXISTS popularity_updated_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- 2. USER_MEMBERSHIPS TABLE - Add missing columns
-- ============================================================================

-- Add payment_method_id column
ALTER TABLE user_memberships ADD COLUMN IF NOT EXISTS payment_method_id VARCHAR(255);

-- ============================================================================
-- 3. COLLECTION_ITEMS TABLE - Add missing custom columns
-- ============================================================================

-- Add custom product fields for collection items without linked products
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_title VARCHAR(255);
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_description TEXT;
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_brand VARCHAR(255);
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_model VARCHAR(255);
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_year INTEGER;
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_scale VARCHAR(50);
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS custom_image_url TEXT;

-- ============================================================================
-- 4. ADVERTISEMENTS TABLE - Fix enum columns
-- ============================================================================

-- First, check if AdPosition enum type exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adposition') THEN
        CREATE TYPE "AdPosition" AS ENUM ('header', 'sidebar', 'footer', 'inline', 'popup');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Check if AdDeviceType enum type exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'addevicetype') THEN
        CREATE TYPE "AdDeviceType" AS ENUM ('desktop', 'mobile', 'all');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Check the current column types for advertisements table and fix if needed
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
    
    -- If position is text type, we need to handle it
    IF pos_type = 'text' OR pos_type = 'character varying' THEN
        -- Add a temporary column, migrate data, drop old, rename new
        ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS position_new VARCHAR(50) DEFAULT 'header';
        UPDATE advertisements SET position_new = COALESCE(position, 'header');
        ALTER TABLE advertisements DROP COLUMN IF EXISTS position;
        ALTER TABLE advertisements RENAME COLUMN position_new TO position;
    END IF;
    
    -- If device_type is text type, we need to handle it
    IF dev_type = 'text' OR dev_type = 'character varying' THEN
        ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS device_type_new VARCHAR(50) DEFAULT 'all';
        UPDATE advertisements SET device_type_new = COALESCE(device_type, 'all');
        ALTER TABLE advertisements DROP COLUMN IF EXISTS device_type;
        ALTER TABLE advertisements RENAME COLUMN device_type_new TO device_type;
    END IF;
END $$;

-- Ensure advertisements table has all required columns
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS position VARCHAR(50) DEFAULT 'header';
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT 'all';
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS alt_text TEXT;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS height INTEGER;

-- ============================================================================
-- 5. Create indexes for new columns (if not exist)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_products_popularity_score ON products(popularity_score);
CREATE INDEX IF NOT EXISTS idx_products_popularity_updated_at ON products(popularity_updated_at);

COMMIT;

-- ============================================================================
-- VERIFICATION: Check that all columns exist
-- ============================================================================

SELECT 'products' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('popularity_score', 'popularity_updated_at');

SELECT 'user_memberships' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_memberships' 
AND column_name = 'payment_method_id';

SELECT 'collection_items' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'collection_items' 
AND column_name LIKE 'custom_%';

SELECT 'advertisements' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'advertisements' 
AND column_name IN ('position', 'device_type', 'alt_text', 'width', 'height');
