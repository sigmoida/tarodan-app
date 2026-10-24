-- Listing boost: each boost's own home showcase window (tarodan-ops plan
-- 2026-10-21-listing-boost, LB4). A showcase package runs its showcase days in
-- a queue of its own, apart from the search-priority queue, so the listing's
-- showcase end can only be rebuilt from each boost's own showcase end; reading
-- it from `ends_at` gave a stacked showcase boost free showcase days whenever
-- staff paused, resumed or extended a boost of the listing. A paused showcase
-- boost keeps its own unused showcase seconds next to the existing
-- `paused_remaining_seconds`.
--
-- LIVE DATA SAFETY: additive only. Two nullable columns on "product_boosts",
-- no default, no backfill and no rewrite of existing rows. The old image never
-- reads them. Rows written before this migration keep NULL and the timeline
-- falls back to the listing's "home_showcase_until" (capped by "ends_at"),
-- which is what those listings show today, so nothing changes for them until
-- their next timeline write. Safe while the previous image and mobile 1.0.5
-- keep running.
--
-- ROLLBACK: revert the API code; the columns are harmless if left. To remove
-- them, a later migration drops "showcase_ends_at" and
-- "paused_showcase_seconds".

-- AlterTable
ALTER TABLE "product_boosts" ADD COLUMN     "paused_showcase_seconds" INTEGER,
ADD COLUMN     "showcase_ends_at" TIMESTAMP(3);
