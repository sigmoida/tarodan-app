-- Unified double-entry ledger (Faz 6): immutable, append-only source of truth for
-- money consistency. Each money event writes a balanced group (Σdebit == Σcredit,
-- enforced by LedgerService). No FKs (soft refs) so the audit trail survives even if
-- source rows are deleted. Corrections are made with reversing entries, never updates.

-- CreateEnum
CREATE TYPE "LedgerEventType" AS ENUM ('payment_captured', 'hold_released', 'payout_created', 'payout_completed', 'refund_issued', 'trade_commission', 'adjustment');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('buyer_payment', 'seller_escrow', 'platform_commission', 'withholding_tax', 'payout', 'refund');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entry_group_id" TEXT NOT NULL,
    "event_type" "LedgerEventType" NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "payment_id" TEXT,
    "order_id" TEXT,
    "trade_id" TEXT,
    "payout_id" TEXT,
    "hold_id" TEXT,
    "seller_id" TEXT,
    "buyer_id" TEXT,
    "memo" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_entry_group_id_idx" ON "ledger_entries"("entry_group_id");
CREATE INDEX "ledger_entries_account_created_at_idx" ON "ledger_entries"("account", "created_at");
CREATE INDEX "ledger_entries_event_type_created_at_idx" ON "ledger_entries"("event_type", "created_at");
CREATE INDEX "ledger_entries_order_id_idx" ON "ledger_entries"("order_id");
CREATE INDEX "ledger_entries_seller_id_account_idx" ON "ledger_entries"("seller_id", "account");
