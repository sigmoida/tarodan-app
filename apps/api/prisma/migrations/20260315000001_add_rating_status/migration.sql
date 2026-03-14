-- AlterTable: Add status column to ratings (seller/user ratings) for admin approval flow
ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "status" "RatingStatus" NOT NULL DEFAULT 'pending';

-- Set all existing ratings to approved so they continue to display
UPDATE "ratings" SET "status" = 'approved' WHERE "status" = 'pending';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ratings_status_idx" ON "ratings"("status");
