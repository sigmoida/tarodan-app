-- Refund sweep backoff (D1, the refund sweep loop): consecutive definite
-- provider failures of a refund attempt. The order refund sweep waits
-- 10 min * 2^(n-1), at most 6 h, after the attempt's last update before it
-- resends the refund, instead of resending it every 5 minutes.
--
-- Additive and safe on live data: a NOT NULL column with a constant default
-- (no table rewrite on PostgreSQL 11+). Existing rows start at 0, which
-- means "first wait" (10 minutes). No backfill.
-- Rollback: ALTER TABLE "refund_attempts" DROP COLUMN "failure_count";

-- AlterTable
ALTER TABLE "refund_attempts" ADD COLUMN "failure_count" INTEGER NOT NULL DEFAULT 0;
