-- Installment payments: validate the constraints the previous migration
-- (20261103120000_installment_payments_schema) added NOT VALID on existing
-- tables. They have constrained every new or updated row since then; this
-- checks the existing rows.
--
-- A separate migration on purpose: Prisma runs each migration as one
-- transaction, and the previous one holds ACCESS EXCLUSIVE locks on
-- payments, orders and refund_attempts until it commits. VALIDATE in that
-- same transaction would scan the tables under those locks. Here it takes
-- only SHARE UPDATE EXCLUSIVE (reads and writes continue) and ROW SHARE on
-- the referenced table for the FK.
--
-- Safe on live data: the columns are new, so every existing row has
-- installment_fee_amount = 0 and charged_amount / charge_attempt_id NULL,
-- which satisfies all five. If this migration fails, a row was written in
-- between that breaks a money invariant: stop and inspect it (dry run in
-- docs/OPERATIONS.md, "Installment payments: schema"); do not drop the
-- constraint.
--
-- Rollback: none needed (validation only). A rollback of the feature drops
-- the constraints with their columns (see the previous migration).
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_charged_amount_check";
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_installment_fee_amount_check";
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_charge_attempt_id_fkey";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_installment_fee_amount_check";
ALTER TABLE "refund_attempts" VALIDATE CONSTRAINT "refund_attempts_installment_fee_amount_check";
