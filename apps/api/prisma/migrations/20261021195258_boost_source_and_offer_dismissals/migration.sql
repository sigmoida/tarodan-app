-- Listing boost foundation (tarodan-ops plan 2026-10-21-listing-boost, LB1):
-- where a boost came from (purchase or free admin grant), who stopped it and
-- why, how much was refunded, the reminder claim stamp, and the one-time
-- boost offer dismissals for new listings.
--
-- LIVE DATA SAFETY: additive only. One new enum, eight new columns on
-- "product_boosts" (seven nullable, "source" defaulted to 'purchase', which is
-- what every existing row is) and one new, empty table. No existing data
-- changes and the old image never reads any of it, so it is safe while the
-- previous image and mobile 1.0.5 keep running.
--
-- ROLLBACK: revert the API code; the columns and the table are harmless if
-- left. To remove them, a later migration drops "boost_offer_dismissals", the
-- eight columns (with their foreign keys) and the "BoostSource" type.

-- CreateEnum
CREATE TYPE "BoostSource" AS ENUM ('purchase', 'admin_grant');

-- AlterTable
ALTER TABLE "product_boosts" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_id" TEXT,
ADD COLUMN     "grant_reason" TEXT,
ADD COLUMN     "granted_by_id" TEXT,
ADD COLUMN     "refunded_amount" DECIMAL(10,2),
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3),
ADD COLUMN     "source" "BoostSource" NOT NULL DEFAULT 'purchase';

-- CreateTable
CREATE TABLE "boost_offer_dismissals" (
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dismissed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boost_offer_dismissals_pkey" PRIMARY KEY ("product_id")
);

-- CreateIndex
CREATE INDEX "boost_offer_dismissals_user_id_idx" ON "boost_offer_dismissals"("user_id");

-- AddForeignKey
ALTER TABLE "product_boosts" ADD CONSTRAINT "product_boosts_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_boosts" ADD CONSTRAINT "product_boosts_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_offer_dismissals" ADD CONSTRAINT "boost_offer_dismissals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_offer_dismissals" ADD CONSTRAINT "boost_offer_dismissals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

