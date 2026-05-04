-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TradeStatus" ADD VALUE 'awaiting_payment';
ALTER TYPE "TradeStatus" ADD VALUE 'shipping_to_warehouse';
ALTER TYPE "TradeStatus" ADD VALUE 'at_warehouse';
ALTER TYPE "TradeStatus" ADD VALUE 'admin_reviewing';
ALTER TYPE "TradeStatus" ADD VALUE 'shipping_to_recipients';
ALTER TYPE "TradeStatus" ADD VALUE 'returning';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_reason" TEXT;

-- AlterTable
ALTER TABLE "trade_cash_payments" ADD COLUMN     "hold_release_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trade_shipments" ADD COLUMN     "leg" TEXT NOT NULL DEFAULT 'to_warehouse',
ADD COLUMN     "recipient_type" TEXT NOT NULL DEFAULT 'warehouse',
ADD COLUMN     "recipient_user_id" TEXT;

-- CreateIndex
CREATE INDEX "trade_shipments_leg_idx" ON "trade_shipments"("leg");
