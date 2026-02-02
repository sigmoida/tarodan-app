-- Add missing login tracking columns to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_activity_at" TIMESTAMP(3);
