-- Review moderation: admins hide and show again product reviews
-- ("product_ratings") and user ratings ("ratings") with a reason.
--
-- 1. A new "RatingStatus" value `hidden`. Only `approved` is public
--    (common/helpers/public-rating.ts), so a hidden row leaves every public
--    list, count, average and the next nightly trust score run without a new
--    read rule. The value is not used inside this migration, so ADD VALUE is
--    safe in the migration transaction (PostgreSQL 12+).
-- 2. On both tables, the last moderation: the reason (free text, required by
--    the API when hiding), the time and the admin. The full history stays in
--    "audit_logs". The admin FK is ON DELETE SET NULL: removing an admin must
--    not delete or block reviews.
--
-- LIVE DATA SAFETY: additive only. Three nullable columns per table, two FKs
-- on columns that are NULL everywhere (no row is checked), one enum value. No
-- row changes, NO BACKFILL. Existing `pending` / `rejected` rows keep their
-- status and stay non-public.
--
-- Rollback: drop the six columns and the two constraints, then delete this
-- migration's row from "_prisma_migrations". PostgreSQL cannot drop an enum
-- value; an unused `hidden` is harmless. Rows already hidden must first be set
-- to another non-public status (e.g. `rejected`) before the code is rolled
-- back, or the old client fails to read them.

-- AlterEnum
ALTER TYPE "RatingStatus" ADD VALUE IF NOT EXISTS 'hidden';

-- AlterTable
ALTER TABLE "ratings" ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by_admin_id" TEXT,
ADD COLUMN     "moderation_reason" TEXT;

-- AlterTable
ALTER TABLE "product_ratings" ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by_admin_id" TEXT,
ADD COLUMN     "moderation_reason" TEXT;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_moderated_by_admin_id_fkey" FOREIGN KEY ("moderated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ratings" ADD CONSTRAINT "product_ratings_moderated_by_admin_id_fkey" FOREIGN KEY ("moderated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
