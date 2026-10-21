-- Per-user security log history, newest first: the admin user detail lists a
-- user's sign-in method events (`WHERE user_id = $1 AND event_type IN (...)
-- ORDER BY created_at DESC LIMIT n`). The single `user_id` index made Postgres
-- read and sort every row of the user; with (user_id, created_at) it walks the
-- index backwards and stops at the page. Also serves the system logs filtered
-- by user (default sort: created_at DESC).
--
-- LIVE DATA SAFETY: an index only, no data change. A plain CREATE INDEX briefly
-- blocks writes to `security_logs` while it builds; the table is bounded by the
-- 180-day log retention and Prisma runs migrations in a transaction, so the
-- repo precedent (20261006100000_payments_provider_conversation_id_index) is
-- kept. Rollback: DROP INDEX "security_logs_user_id_created_at_idx".
CREATE INDEX IF NOT EXISTS "security_logs_user_id_created_at_idx"
  ON "security_logs" ("user_id", "created_at");
