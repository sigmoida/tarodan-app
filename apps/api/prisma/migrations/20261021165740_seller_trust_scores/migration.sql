-- Seller trust score (ADR 0014, docs/SELLER_TRUST.md): one row per scored
-- seller, written only by the nightly `seller-trust-refresh` batch and read by
-- primary key. Its own table so the nightly write never rewrites the hot
-- `users` row.
--
-- LIVE DATA SAFETY: additive only. A new, empty table; no existing table,
-- column or index changes, no data. The job is the backfill: on boot an empty
-- table enqueues one run (docs/OPERATIONS.md).
--
-- Load-bearing raw SQL that Prisma does not model (pinned by
-- seller-trust/helpers/seller-trust-migration.spec.ts):
--   * CHECK 0..500 on score_x100 (hundredths of a point; NULL = not enough data)
--   * fillfactor = 90 and no index besides the primary key, so the nightly
--     upsert of every row is a HOT update and the table does not bloat.

-- CreateTable
CREATE TABLE "seller_trust_scores" (
    "user_id" TEXT NOT NULL,
    "score_x100" SMALLINT,
    "formula_version" SMALLINT NOT NULL,
    "components" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_trust_scores_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "seller_trust_scores_score_x100_range" CHECK ("score_x100" BETWEEN 0 AND 500)
) WITH (fillfactor = 90);

-- AddForeignKey
ALTER TABLE "seller_trust_scores" ADD CONSTRAINT "seller_trust_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
