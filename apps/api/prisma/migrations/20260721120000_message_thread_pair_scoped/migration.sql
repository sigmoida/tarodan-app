-- Scenario B: one message thread per participant pair (product context per message).
-- Merges the previously product-scoped duplicate threads into a single per-pair
-- thread. REVIEW + BACK UP the database before running against production data.

-- 1) Per-message product context.
ALTER TABLE "messages" ADD COLUMN "product_id" TEXT;

-- 2) Backfill each message's product from its (product-scoped) thread.
UPDATE "messages" m
SET "product_id" = t."product_id"
FROM "message_threads" t
WHERE m."thread_id" = t."id" AND t."product_id" IS NOT NULL;

-- 3) Reassign messages from duplicate per-pair threads to the earliest (canonical)
--    thread. Done BEFORE deleting duplicates so the ON DELETE CASCADE on
--    messages.thread_id never removes real messages.
WITH ranked AS (
  SELECT "id",
         first_value("id") OVER (
           PARTITION BY "participant1_id", "participant2_id"
           ORDER BY "created_at" ASC, "id" ASC
         ) AS canonical_id
  FROM "message_threads"
)
UPDATE "messages" m
SET "thread_id" = r.canonical_id
FROM ranked r
WHERE m."thread_id" = r."id" AND r."id" <> r.canonical_id;

-- 4) Delete the now-empty duplicate threads.
WITH ranked AS (
  SELECT "id",
         first_value("id") OVER (
           PARTITION BY "participant1_id", "participant2_id"
           ORDER BY "created_at" ASC, "id" ASC
         ) AS canonical_id
  FROM "message_threads"
)
DELETE FROM "message_threads" t
USING ranked r
WHERE t."id" = r."id" AND r."id" <> r.canonical_id;

-- 5) Refresh the canonical thread's last_message_at + latest (non-null) product.
UPDATE "message_threads" t
SET "last_message_at" = COALESCE(sub.max_created, t."last_message_at"),
    "product_id" = sub.recent_product
FROM (
  SELECT "thread_id",
         MAX("created_at") AS max_created,
         (ARRAY_AGG("product_id" ORDER BY "created_at" DESC)
            FILTER (WHERE "product_id" IS NOT NULL))[1] AS recent_product
  FROM "messages"
  GROUP BY "thread_id"
) sub
WHERE t."id" = sub."thread_id";

-- 6) Swap uniqueness from (pair, product) to (pair).
DROP INDEX IF EXISTS "message_threads_participant1_id_participant2_id_product_id_key";
CREATE UNIQUE INDEX "message_threads_participant1_id_participant2_id_key"
  ON "message_threads" ("participant1_id", "participant2_id");

-- 7) Index for message product lookups.
CREATE INDEX "messages_product_id_idx" ON "messages" ("product_id");
