-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'returned', 'retry_pending');

-- CreateTable
CREATE TABLE "seller_bank_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_holder" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "tc_kimlik_no" TEXT,
    "tax_id" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_transfers" (
    "id" TEXT NOT NULL,
    "payment_hold_id" TEXT,
    "trade_cash_payment_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "merchant_oid" TEXT NOT NULL,
    "trans_id" TEXT NOT NULL,
    "transfer_iban" TEXT NOT NULL,
    "transfer_name" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "provider_response" JSONB,
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "next_retry_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_bank_accounts_user_id_key" ON "seller_bank_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_transfers_payment_hold_id_key" ON "payout_transfers"("payment_hold_id");

-- CreateIndex
CREATE UNIQUE INDEX "payout_transfers_trans_id_key" ON "payout_transfers"("trans_id");

-- CreateIndex
CREATE INDEX "payout_transfers_seller_id_idx" ON "payout_transfers"("seller_id");

-- CreateIndex
CREATE INDEX "payout_transfers_status_idx" ON "payout_transfers"("status");

-- CreateIndex
CREATE INDEX "payout_transfers_processed_at_idx" ON "payout_transfers"("processed_at");

-- AddForeignKey
ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_transfers" ADD CONSTRAINT "payout_transfers_payment_hold_id_fkey" FOREIGN KEY ("payment_hold_id") REFERENCES "payment_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_transfers" ADD CONSTRAINT "payout_transfers_trade_cash_payment_id_fkey" FOREIGN KEY ("trade_cash_payment_id") REFERENCES "trade_cash_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_transfers" ADD CONSTRAINT "payout_transfers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
