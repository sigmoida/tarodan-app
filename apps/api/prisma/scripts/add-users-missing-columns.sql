-- Run this in PostgreSQL if migration/db push is not possible.
-- Adds missing User columns so admin login works.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birth_date" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accepts_marketing_emails" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_reason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned_by" TEXT;
