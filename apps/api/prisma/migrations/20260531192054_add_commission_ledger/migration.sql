-- CreateEnum
CREATE TYPE "CommissionLedgerStatus" AS ENUM ('pending', 'earned', 'refunded', 'waived');

-- CreateTable
CREATE TABLE "commission_ledger" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seller_commission" DECIMAL(10,2) NOT NULL,
    "buyer_fee" DECIMAL(10,2) NOT NULL,
    "total_platform_revenue" DECIMAL(10,2) NOT NULL,
    "status" "CommissionLedgerStatus" NOT NULL DEFAULT 'pending',
    "earned_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "waived_at" TIMESTAMP(3),
    "waived_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_ledger_order_id_key" ON "commission_ledger"("order_id");

-- CreateIndex
CREATE INDEX "commission_ledger_status_idx" ON "commission_ledger"("status");

-- CreateIndex
CREATE INDEX "commission_ledger_earned_at_idx" ON "commission_ledger"("earned_at");

-- AddForeignKey
ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
