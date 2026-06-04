-- CreateEnum
CREATE TYPE "ReturnShippingPayer" AS ENUM ('buyer', 'seller', 'platform');

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN     "buyer_initiated_amicable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refund_buyer_fee" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refund_product_amount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refund_seller_commission" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refund_shipping_fee" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "return_shipping_payer" "ReturnShippingPayer";
