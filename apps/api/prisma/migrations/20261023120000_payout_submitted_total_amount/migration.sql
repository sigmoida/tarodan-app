-- Payout transfers: persist the PayTR `total_amount` each instruction sent.
--
-- Why: the platform transfer used to send `amount` (the order total) as
-- `total_amount`, which PayTR rejects (err_no 010) once a refund lowered what
-- the payment (merchant_oid) has left. The total is now computed per attempt
-- and stored here at claim time so sibling transfers on the same oid can
-- subtract it.
--
-- Safe on live data: one nullable column, no default, no backfill. Readers
-- fall back to `amount` for rows sent before this release, which is what they
-- sent. Rollback: ALTER TABLE "payout_transfers" DROP COLUMN "submitted_total_amount";

-- AlterTable
ALTER TABLE "payout_transfers" ADD COLUMN     "submitted_total_amount" DECIMAL(10,2);
