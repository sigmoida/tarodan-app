-- Saved searches (docs/SAVED_SEARCHES.md): a user's saved GET /products
-- query, and the tier limit on how many a member may keep.
--
-- LIVE DATA SAFETY: additive only. One new, empty table and one new column
-- with a default (5 for every existing tier). No existing data changes; the
-- old image never reads either. The paid-tier values (basic 10, premium 20,
-- business 50) are set after deploy by `maintenance/set-saved-search-limits.ts`
-- (docs/OPERATIONS.md), never here.
--
-- ROLLBACK: a later migration drops the table and the column.

-- AlterTable
ALTER TABLE "membership_tiers" ADD COLUMN     "max_saved_searches" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "query" JSONB NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "query_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_searches_user_id_created_at_idx" ON "saved_searches"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_searches_user_id_query_hash_key" ON "saved_searches"("user_id", "query_hash");

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
