-- CreateEnum
CREATE TYPE "BuyerConfirmationType" AS ENUM ('manual_ok', 'auto_timeout', 'admin_force');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "buyer_confirmation_type" "BuyerConfirmationType",
ADD COLUMN     "buyer_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "confirmation_deadline" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3);
