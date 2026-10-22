-- Consent records: a real column for the trade cash payment a distance sales
-- consent belongs to.
--
-- A trade has no order or cart: each party pays its own "trade_cash_payments"
-- row, and its distance sales consent (taken on the pay page) was bound to that
-- row only through "details" JSON ({ tradeId, tradeNumber, tradeCashPaymentId }).
-- That left the payment gate on an unindexed JSON scan, the admin search
-- unable to find a trade number, and no database guard against two concurrent
-- pay-page submits writing two consent rows for the same payment.
--
-- 1. "trade_cash_payment_id": nullable FK, ON DELETE SET NULL like the cart and
--    order links (the evidence stays when the test-lane purge deletes a trade
--    and its cash payments cascade), plus an index for the FK action, the gate
--    lookup and the admin search join.
-- 2. A partial unique index: ONE granted distance sales row per trade cash
--    payment. The API treats the violation of a concurrent second submit as
--    "already recorded". Rows written before this migration have the column
--    NULL, so they cannot conflict here.
-- 3. The append-only guard of "consent_records" learns the new column. It
--    already allowed only the SET NULL of "checkout_group_id" / "order_id";
--    now it also allows
--      - "trade_cash_payment_id" -> NULL (the new FK's SET NULL; without this
--        the test-lane purge would fail on the trigger), and
--      - "trade_cash_payment_id" NULL -> the row's own
--        details->>'tradeCashPaymentId' (the backfill can only copy what the
--        row already says; any other value is refused).
--    Everything else stays as it was: DELETE refused, every other column
--    immutable, the "tarodan.allow_consent_purge" session flag unchanged.
--
-- LIVE DATA SAFETY: additive only. ADD COLUMN without a default is a catalog
-- change (no table rewrite). The two CREATE INDEX statements scan the table
-- once under a SHARE lock (writes wait for the scan, reads go on); every row's
-- new column is NULL, so the partial index stays empty. NO BACKFILL here: the
-- copy from "details" is the maintenance script
-- "backfill:prod:consent-trade-cash-payments" (docs/OPERATIONS.md). The old
-- image neither reads nor writes the column and keeps writing "details", which
-- the new image still reads as a fallback, so the two can run side by side
-- during the deploy. No API contract change (mobile 1.0.5 and later unaffected).
--
-- ROLLBACK: revert the API code; the column, the indexes and the wider guard
-- are harmless if left. To remove them, a later migration runs:
--   DROP INDEX IF EXISTS "consent_records_trade_cash_payment_granted_key";
--   DROP INDEX IF EXISTS "consent_records_trade_cash_payment_id_idx";
--   ALTER TABLE "consent_records" DROP CONSTRAINT IF EXISTS "consent_records_trade_cash_payment_id_fkey";
--   ALTER TABLE "consent_records" DROP COLUMN IF EXISTS "trade_cash_payment_id";
-- and then restores the function body of 20261005100000_consent_records (the
-- column must be dropped first: the old body compares every other column, so
-- with the column present it would refuse the new FK's SET NULL).

-- AlterTable
ALTER TABLE "consent_records" ADD COLUMN "trade_cash_payment_id" TEXT;

-- CreateIndex
CREATE INDEX "consent_records_trade_cash_payment_id_idx"
ON "consent_records"("trade_cash_payment_id");

-- One granted distance sales consent per trade cash payment.
CREATE UNIQUE INDEX "consent_records_trade_cash_payment_granted_key"
ON "consent_records"("trade_cash_payment_id")
WHERE "document" = 'distance_sales'
  AND "action" = 'granted'
  AND "trade_cash_payment_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_trade_cash_payment_id_fkey"
  FOREIGN KEY ("trade_cash_payment_id") REFERENCES "trade_cash_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The append-only guard (trigger "consent_records_append_only_guard", created
-- in 20261005100000_consent_records, keeps calling this function).
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('tarodan.allow_consent_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'consent_records: DELETE refused (consent records are append-only)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF (NEW.checkout_group_id IS NULL OR NEW.checkout_group_id IS NOT DISTINCT FROM OLD.checkout_group_id)
  AND (NEW.order_id IS NULL OR NEW.order_id IS NOT DISTINCT FROM OLD.order_id)
  AND (
    NEW.trade_cash_payment_id IS NULL
    OR NEW.trade_cash_payment_id IS NOT DISTINCT FROM OLD.trade_cash_payment_id
    OR (
      OLD.trade_cash_payment_id IS NULL
      AND NEW.trade_cash_payment_id = OLD.details ->> 'tradeCashPaymentId'
    )
  )
  AND (to_jsonb(NEW) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id')
      = (to_jsonb(OLD) - 'checkout_group_id' - 'order_id' - 'trade_cash_payment_id')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'consent_records: UPDATE refused (only a deleted cart, order or trade cash payment link may become NULL, or the trade cash payment link may be filled from details)'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
