-- Installment payments, schema only (ADR 0019; tarodan-ops plan
-- 2026-11-03-installment-payments, task A2).
--
-- Why: the buyer can split a card payment into PayTR installments and pays
-- the installment fee (vade farkı, F) on top of the goods total T. PayTR then
-- charges C = T + F. `Payment.amount` keeps meaning T (every goods-scale
-- reader stays as is); the PSP-scale values get their own columns, every
-- signed form gets a priced snapshot row (`payment_charge_attempts`), admin
-- advantage rules are versioned rows (`installment_rules`) and the daily
-- PayTR rate table is stored (`installment_rate_snapshots`).
--
-- Safe on live data (additive, backward compatible, inert while the
-- `installments_enabled` setting is off, which is its default):
-- * New columns on existing tables are NULL or carry a constant default:
--   metadata-only on PostgreSQL 11+ (no table rewrite). No backfill: NULL
--   `charged_amount` means legacy, read as `amount` (`chargedAmountOf`).
-- * CHECK constraints and the one FK on existing tables are added NOT VALID
--   (no scan under the ACCESS EXCLUSIVE lock); the next migration,
--   20261103120100_installment_payments_validate_constraints, validates them
--   under SHARE UPDATE EXCLUSIVE, which does not block reads or writes.
-- * Lock waits are bounded: `lock_timeout` is 3 s for this transaction. A
--   waiting ACCESS EXCLUSIVE request queues every later read and write of the
--   table behind it, so without a bound one long transaction would stall
--   checkout for as long as it runs. Once granted, the locks are held only for
--   this short, scan-free transaction. The unique index on
--   `payments.charge_attempt_id` is built by its own migration
--   (20261103120200), under a SHARE lock on `payments` only.
-- * Existing tables are altered in the application's lock order (payments,
--   then orders, then refund_attempts; `payment/helpers/payment-order-lock.ts`).
--   That avoids a deadlock with payment writers that lock payment before
--   order, but NOT with every transaction: one that touched `orders` (even a
--   plain SELECT) and then reads `payments` can still deadlock with this
--   migration. Postgres then aborts one side: a user request fails, or this
--   migration fails.
-- * A lock timeout or a deadlock is the expected safe failure: the whole
--   transaction rolls back and nothing changes, but Prisma records the
--   migration as failed and refuses later deploys (P3009) until it is marked
--   rolled back. Recovery is in docs/OPERATIONS.md, "Installment payments:
--   schema"; deploy at a quiet time.
-- * New enum values are not used in this transaction (PostgreSQL 12+ rule).
-- * New tables are empty. Old code never writes the new columns: their
--   defaults satisfy every CHECK and trigger, and the payments trigger does
--   nothing while `charge_attempt_id` stays NULL.
--
-- Rollback: the flag stays off and every new table and column is inert. Once
-- any installment payment exists, roll FORWARD only (refund, payout and
-- ledger code must keep reading F and P). Before any such payment, a
-- rollback migration would drop the triggers and functions, the FK
-- `payments_charge_attempt_id_fkey`, the three tables, the new columns and
-- the `InstallmentSegment` type; enum values cannot be dropped from
-- `LedgerAccount` / `ElogoInvoiceType` and stay unused.

-- Bounds the wait for each lock of this transaction (see above). LOCAL: it
-- ends with Prisma's migration transaction and never reaches the next
-- migration or the app's connections.
SET LOCAL lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "InstallmentSegment" AS ENUM ('all', 'guest', 'free', 'basic', 'premium', 'business');

-- Buyer document for the buyer-paid installment fee (D4).
ALTER TYPE "ElogoInvoiceType" ADD VALUE IF NOT EXISTS 'buyer_installment_fee';

-- Buyer-paid fee income; platform-absorbed installment cost.
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'installment_fee';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'installment_platform_cost';

-- ---------------------------------------------------------------------------
-- Existing tables, in payment -> order lock order (does not rule out every
-- deadlock, see the header): payments -> orders -> refund_attempts
-- ---------------------------------------------------------------------------
ALTER TABLE "payments"
  ADD COLUMN "installment_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "charged_amount" DECIMAL(10,2),
  ADD COLUMN "charge_attempt_id" TEXT;

-- NULL charged amount = legacy (read as `amount`), which carries no fee.
-- Otherwise C = T + F, and a fee only comes from a priced charge attempt.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_charged_amount_check"
  CHECK (("charged_amount" IS NULL AND "installment_fee_amount" = 0)
         OR ("charged_amount" = "amount" + "installment_fee_amount"
             AND ("installment_fee_amount" = 0 OR "charge_attempt_id" IS NOT NULL))) NOT VALID;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_installment_fee_amount_check"
  CHECK ("installment_fee_amount" >= 0) NOT VALID;

ALTER TABLE "orders"
  ADD COLUMN "installment_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_installment_fee_amount_check"
  CHECK ("installment_fee_amount" >= 0) NOT VALID;

-- `amount` is the PSP `return_amount`; the fee share is a part of it.
ALTER TABLE "refund_attempts"
  ADD COLUMN "installment_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_installment_fee_amount_check"
  CHECK ("installment_fee_amount" >= 0 AND "installment_fee_amount" <= "amount") NOT VALID;

-- ---------------------------------------------------------------------------
-- installment_rules: admin advantage rules, one immutable version per row
-- ---------------------------------------------------------------------------
CREATE TABLE "installment_rules" (
    "id" TEXT NOT NULL,
    "lineage_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "InstallmentSegment" NOT NULL,
    "min_count" INTEGER NOT NULL,
    "max_count" INTEGER NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "platform_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "archived_by" TEXT,

    CONSTRAINT "installment_rules_pkey" PRIMARY KEY ("id"),
    -- The first version starts the lineage: its id is the lineage id.
    CONSTRAINT "installment_rules_version_check"
      CHECK ("version" >= 1 AND ("version" > 1 OR "lineage_id" = "id")),
    CONSTRAINT "installment_rules_name_check" CHECK (btrim("name") <> ''),
    CONSTRAINT "installment_rules_count_range_check"
      CHECK ("min_count" >= 2 AND "max_count" <= 12 AND "min_count" <= "max_count"),
    -- A disallowed range has nothing to share.
    CONSTRAINT "installment_rules_platform_share_check"
      CHECK ("platform_share_pct" >= 0 AND "platform_share_pct" <= 100
             AND ("allowed" OR "platform_share_pct" = 0)),
    CONSTRAINT "installment_rules_validity_check"
      CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
    CONSTRAINT "installment_rules_archived_check"
      CHECK ("archived_at" IS NOT NULL OR "archived_by" IS NULL)
);

CREATE UNIQUE INDEX "installment_rules_lineage_id_version_key" ON "installment_rules"("lineage_id", "version");
CREATE INDEX "installment_rules_archived_at_segment_valid_from_idx" ON "installment_rules"("archived_at", "segment", "valid_from");
-- "Edit" archives the current version and inserts the next one in one
-- transaction: two concurrent edits of one rule cannot both leave a live
-- version.
CREATE UNIQUE INDEX "installment_rules_one_live_version_per_lineage"
  ON "installment_rules"("lineage_id") WHERE "archived_at" IS NULL;

-- ---------------------------------------------------------------------------
-- installment_rate_snapshots: daily PayTR `taksit-oranlari`, append-only
-- ---------------------------------------------------------------------------
CREATE TABLE "installment_rate_snapshots" (
    "id" TEXT NOT NULL,
    "paytr_merchant" "PaytrMerchant" NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "max_installment_non_business" INTEGER,
    "single_rate_pct" DECIMAL(6,3) NOT NULL,
    "rates" JSONB NOT NULL,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_rate_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "installment_rate_snapshots_single_rate_check"
      CHECK ("single_rate_pct" >= 0 AND "single_rate_pct" < 100),
    CONSTRAINT "installment_rate_snapshots_max_installment_check"
      CHECK ("max_installment_non_business" IS NULL OR "max_installment_non_business" >= 0)
);

CREATE INDEX "installment_rate_snapshots_paytr_merchant_fetched_at_idx" ON "installment_rate_snapshots"("paytr_merchant", "fetched_at");

-- ---------------------------------------------------------------------------
-- payment_charge_attempts: one priced snapshot per signed merchant_oid
-- ---------------------------------------------------------------------------
CREATE TABLE "payment_charge_attempts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "merchant_oid" TEXT NOT NULL,
    "paytr_merchant" "PaytrMerchant" NOT NULL,
    "installment_count" INTEGER NOT NULL,
    "base_amount" DECIMAL(10,2) NOT NULL,
    "installment_fee_amount" DECIMAL(10,2) NOT NULL,
    "charged_amount" DECIMAL(10,2) NOT NULL,
    "platform_cost_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "single_rate_pct" DECIMAL(6,3),
    "installment_rate_pct" DECIMAL(6,3),
    "fee_vat_rate_pct" DECIMAL(5,2) NOT NULL,
    "buyer_segment" "InstallmentSegment" NOT NULL,
    "installment_rule_id" TEXT,
    "platform_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "card_family" TEXT,
    "card_bank" TEXT,
    "card_type" TEXT,
    "business_card" BOOLEAN,
    "bin6" TEXT,
    "saved_card_id" TEXT,
    "rate_snapshot_id" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_charge_attempts_pkey" PRIMARY KEY ("id"),
    -- 1 = single payment (PayTR `installment_count = 0`), else 2..12.
    CONSTRAINT "payment_charge_attempts_installment_count_check"
      CHECK ("installment_count" BETWEEN 1 AND 12),
    -- C = T + F, F >= 0, T > 0: the signed amount is never below the goods total.
    CONSTRAINT "payment_charge_attempts_amounts_check"
      CHECK ("base_amount" > 0 AND "installment_fee_amount" >= 0
             AND "charged_amount" = "base_amount" + "installment_fee_amount"
             AND "platform_cost_amount" >= 0),
    CONSTRAINT "payment_charge_attempts_pct_check"
      CHECK ("platform_share_pct" BETWEEN 0 AND 100
             AND "fee_vat_rate_pct" BETWEEN 0 AND 100
             AND ("single_rate_pct" IS NULL OR ("single_rate_pct" >= 0 AND "single_rate_pct" < 100))
             AND ("installment_rate_pct" IS NULL OR ("installment_rate_pct" >= 0 AND "installment_rate_pct" < 100))),
    -- A single payment carries no fee, no platform cost and no rule (rules
    -- cover counts 2..12).
    CONSTRAINT "payment_charge_attempts_single_check"
      CHECK ("installment_count" > 1
             OR ("installment_fee_amount" = 0 AND "platform_cost_amount" = 0
                 AND "installment_rule_id" IS NULL AND "platform_share_pct" = 0)),
    -- An installment charge is priced from a rate snapshot and a card family.
    CONSTRAINT "payment_charge_attempts_installment_pricing_check"
      CHECK ("installment_count" = 1
             OR ("rate_snapshot_id" IS NOT NULL AND "single_rate_pct" IS NOT NULL
                 AND "installment_rate_pct" IS NOT NULL AND "card_family" IS NOT NULL)),
    -- The code default (no rule) is "buyer pays all".
    CONSTRAINT "payment_charge_attempts_rule_share_check"
      CHECK ("installment_rule_id" IS NOT NULL OR "platform_share_pct" = 0),
    -- First 6 digits only, never more.
    CONSTRAINT "payment_charge_attempts_bin6_check"
      CHECK ("bin6" IS NULL OR "bin6" ~ '^[0-9]{6}$')
);

CREATE UNIQUE INDEX "payment_charge_attempts_merchant_oid_key" ON "payment_charge_attempts"("merchant_oid");
CREATE INDEX "payment_charge_attempts_payment_id_created_at_idx" ON "payment_charge_attempts"("payment_id", "created_at");
CREATE INDEX "payment_charge_attempts_installment_rule_id_idx" ON "payment_charge_attempts"("installment_rule_id");
CREATE INDEX "payment_charge_attempts_rate_snapshot_id_idx" ON "payment_charge_attempts"("rate_snapshot_id");

-- `payments_charge_attempt_id_key` (unique) is built by
-- 20261103120200_installment_payments_charge_attempt_index.

-- ---------------------------------------------------------------------------
-- Foreign keys (financial evidence: RESTRICT). The one on `payments` is NOT
-- VALID here and validated by the next migration.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_charge_attempts" ADD CONSTRAINT "payment_charge_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_charge_attempts" ADD CONSTRAINT "payment_charge_attempts_installment_rule_id_fkey" FOREIGN KEY ("installment_rule_id") REFERENCES "installment_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_charge_attempts" ADD CONSTRAINT "payment_charge_attempts_rate_snapshot_id_fkey" FOREIGN KEY ("rate_snapshot_id") REFERENCES "installment_rate_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_attempt_id_fkey" FOREIGN KEY ("charge_attempt_id") REFERENCES "payment_charge_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- ---------------------------------------------------------------------------
-- Guards (TRUNCATE stays free, as for the ledger: test DB resets use it)
-- ---------------------------------------------------------------------------

-- installment_rules: a version's values never change; the only write is the
-- one-time archive stamp. No DELETE: a version may be referenced by a charge
-- (the FK alone would allow deleting an unused one, and the audit trail
-- needs every version).
CREATE OR REPLACE FUNCTION installment_rules_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'installment_rules is append-only: DELETE refused (archive the version instead)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."archived_at" IS NOT NULL THEN
    RAISE EXCEPTION 'installment_rules: archived version % is final', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."lineage_id" IS DISTINCT FROM OLD."lineage_id"
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."name" IS DISTINCT FROM OLD."name"
     OR NEW."segment" IS DISTINCT FROM OLD."segment"
     OR NEW."min_count" IS DISTINCT FROM OLD."min_count"
     OR NEW."max_count" IS DISTINCT FROM OLD."max_count"
     OR NEW."allowed" IS DISTINCT FROM OLD."allowed"
     OR NEW."platform_share_pct" IS DISTINCT FROM OLD."platform_share_pct"
     OR NEW."priority" IS DISTINCT FROM OLD."priority"
     OR NEW."valid_from" IS DISTINCT FROM OLD."valid_from"
     OR NEW."valid_until" IS DISTINCT FROM OLD."valid_until"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'installment_rules: version % is immutable (insert a new version)', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER installment_rules_guard
  BEFORE UPDATE OR DELETE ON "installment_rules"
  FOR EACH ROW EXECUTE FUNCTION installment_rules_guard();

-- installment_rate_snapshots: evidence of what a charge was priced from.
-- DELETE stays possible for unreferenced rows (retention); the FK keeps the
-- referenced ones.
CREATE OR REPLACE FUNCTION installment_rate_snapshots_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'installment_rate_snapshots is append-only: UPDATE refused (store a new snapshot)'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER installment_rate_snapshots_append_only
  BEFORE UPDATE ON "installment_rate_snapshots"
  FOR EACH ROW EXECUTE FUNCTION installment_rate_snapshots_append_only();

-- payment_charge_attempts: an attempt belongs to its payment's PayTR store and
-- is priced from that store's rate table (checked at INSERT; later PayTR calls
-- use `payments.paytr_merchant`). The pricing snapshot is frozen at signing;
-- the only write is `captured_at`, once. Columns added later are not frozen by
-- this list on purpose (e.g. a statement-matching flag). DELETE only through
-- the test-lane purge gate (same gate as 20260922150000_test_lane_purge_gate:
-- the session says `app.test_lane_purge = 'on'` AND the payment is a
-- test-lane payment).
CREATE OR REPLACE FUNCTION payment_charge_attempts_guard() RETURNS trigger AS $$
DECLARE
  purging boolean;
  test_row boolean;
  payment_merchant "PaytrMerchant";
  snapshot_merchant "PaytrMerchant";
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p."paytr_merchant" INTO payment_merchant
    FROM "payments" p WHERE p.id = NEW."payment_id";
    IF payment_merchant IS DISTINCT FROM NEW."paytr_merchant" THEN
      RAISE EXCEPTION 'payment_charge_attempts: attempt store % differs from the store of payment %', NEW."paytr_merchant", NEW."payment_id"
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."rate_snapshot_id" IS NOT NULL THEN
      SELECT r."paytr_merchant" INTO snapshot_merchant
      FROM "installment_rate_snapshots" r WHERE r.id = NEW."rate_snapshot_id";
      IF snapshot_merchant IS DISTINCT FROM NEW."paytr_merchant" THEN
        RAISE EXCEPTION 'payment_charge_attempts: rate snapshot % belongs to another store', NEW."rate_snapshot_id"
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    purging := COALESCE(current_setting('app.test_lane_purge', true), 'off') = 'on';
    IF purging THEN
      SELECT COALESCE(p."is_test", false) INTO test_row
      FROM "payments" p WHERE p.id = OLD."payment_id";
      IF COALESCE(test_row, false) THEN
        RETURN OLD;
      END IF;
    END IF;
    RAISE EXCEPTION 'payment_charge_attempts: attempt % is financial evidence, DELETE refused', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
     OR NEW."merchant_oid" IS DISTINCT FROM OLD."merchant_oid"
     OR NEW."paytr_merchant" IS DISTINCT FROM OLD."paytr_merchant"
     OR NEW."installment_count" IS DISTINCT FROM OLD."installment_count"
     OR NEW."base_amount" IS DISTINCT FROM OLD."base_amount"
     OR NEW."installment_fee_amount" IS DISTINCT FROM OLD."installment_fee_amount"
     OR NEW."charged_amount" IS DISTINCT FROM OLD."charged_amount"
     OR NEW."platform_cost_amount" IS DISTINCT FROM OLD."platform_cost_amount"
     OR NEW."single_rate_pct" IS DISTINCT FROM OLD."single_rate_pct"
     OR NEW."installment_rate_pct" IS DISTINCT FROM OLD."installment_rate_pct"
     OR NEW."fee_vat_rate_pct" IS DISTINCT FROM OLD."fee_vat_rate_pct"
     OR NEW."buyer_segment" IS DISTINCT FROM OLD."buyer_segment"
     OR NEW."installment_rule_id" IS DISTINCT FROM OLD."installment_rule_id"
     OR NEW."platform_share_pct" IS DISTINCT FROM OLD."platform_share_pct"
     OR NEW."card_family" IS DISTINCT FROM OLD."card_family"
     OR NEW."card_bank" IS DISTINCT FROM OLD."card_bank"
     OR NEW."card_type" IS DISTINCT FROM OLD."card_type"
     OR NEW."business_card" IS DISTINCT FROM OLD."business_card"
     OR NEW."bin6" IS DISTINCT FROM OLD."bin6"
     OR NEW."saved_card_id" IS DISTINCT FROM OLD."saved_card_id"
     OR NEW."rate_snapshot_id" IS DISTINCT FROM OLD."rate_snapshot_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'payment_charge_attempts: pricing snapshot of attempt % is immutable', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."captured_at" IS NOT NULL
     AND NEW."captured_at" IS DISTINCT FROM OLD."captured_at" THEN
    RAISE EXCEPTION 'payment_charge_attempts: attempt % is already captured', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_charge_attempts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "payment_charge_attempts"
  FOR EACH ROW EXECUTE FUNCTION payment_charge_attempts_guard();

-- payments: the captured attempt must be one of THIS payment's attempts, of
-- the same PayTR store, and carry the same charged amount, fee and
-- installment count (with the CHECK above this also pins the attempt's T to
-- `amount`). Once set it is final; only the test-lane purge (gate as above,
-- test payment) may clear it before deleting the attempts. Checked on INSERT
-- too, so a new row cannot claim another payment's attempt. While
-- `charge_attempt_id` stays NULL (the old image, today's writes) it does
-- nothing.
CREATE OR REPLACE FUNCTION payments_charge_attempt_guard() RETURNS trigger AS $$
DECLARE
  attempt_payment_id text;
  attempt_merchant "PaytrMerchant";
  attempt_count integer;
  attempt_charged numeric;
  attempt_fee numeric;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."charge_attempt_id" IS NOT NULL
     AND NEW."charge_attempt_id" IS DISTINCT FROM OLD."charge_attempt_id" THEN
    IF NEW."charge_attempt_id" IS NULL
       AND OLD."is_test"
       AND COALESCE(current_setting('app.test_lane_purge', true), 'off') = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'payments: payment % is already captured by charge attempt %', OLD."id", OLD."charge_attempt_id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."charge_attempt_id" IS NOT NULL THEN
    SELECT a."payment_id", a."paytr_merchant", a."installment_count",
           a."charged_amount", a."installment_fee_amount"
      INTO attempt_payment_id, attempt_merchant, attempt_count,
           attempt_charged, attempt_fee
    FROM "payment_charge_attempts" a WHERE a.id = NEW."charge_attempt_id";
    IF attempt_payment_id IS DISTINCT FROM NEW."id"
       OR attempt_merchant IS DISTINCT FROM NEW."paytr_merchant"
       OR attempt_count IS DISTINCT FROM NEW."installment_count"
       OR NEW."charged_amount" IS DISTINCT FROM attempt_charged
       OR NEW."installment_fee_amount" IS DISTINCT FROM attempt_fee THEN
      RAISE EXCEPTION 'payments: payment % does not match charge attempt %', NEW."id", NEW."charge_attempt_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_charge_attempt_guard
  BEFORE INSERT OR UPDATE OF "charge_attempt_id", "charged_amount", "installment_fee_amount", "installment_count", "paytr_merchant" ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_charge_attempt_guard();
