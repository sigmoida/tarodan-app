-- Per-user security log history, newest first: the admin user detail lists a
-- user's sign-in method events (`WHERE user_id = $1 AND event_type IN (...)
-- ORDER BY created_at DESC, id DESC LIMIT n`). With only the single `user_id`
-- index Postgres fetches and sorts every row of the user for each page; with
-- (user_id, created_at) it reads the user's rows newest first, skips other
-- event types and needs only an incremental sort for the id tie-break. The
-- page's count still visits every row of the user. Also serves the system
-- logs filtered by user (default sort: created_at DESC).
--
-- LIVE DATA SAFETY: an index only, no data change. A plain CREATE INDEX briefly
-- blocks writes to `security_logs` while it builds; the table is bounded by the
-- 180-day log retention and Prisma runs migrations in a transaction, so the
-- repo precedent (20261006100000_payments_provider_conversation_id_index) is
-- kept. Rollback: DROP INDEX "security_logs_user_id_created_at_idx".
CREATE INDEX IF NOT EXISTS "security_logs_user_id_created_at_idx"
  ON "security_logs" ("user_id", "created_at");
