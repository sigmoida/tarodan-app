-- CreateEnum
CREATE TYPE "CommissionTaxpayerType" AS ENUM ('individual', 'corporate', 'all');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "buyer_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "buyer_service_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "buyer_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "seller_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "seller_platform_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "seller_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "commission_rules" ADD COLUMN     "buyer_commission_max" DECIMAL(10,2),
ADD COLUMN     "buyer_commission_min" DECIMAL(10,2),
ADD COLUMN     "buyer_commission_rate" DECIMAL(7,4),
ADD COLUMN     "buyer_service_fee_max" DECIMAL(10,2),
ADD COLUMN     "buyer_service_fee_min" DECIMAL(10,2),
ADD COLUMN     "buyer_service_fee_rate" DECIMAL(7,4),
ADD COLUMN     "max_amount" DECIMAL(12,2),
ADD COLUMN     "seller_commission_max" DECIMAL(10,2),
ADD COLUMN     "seller_commission_min" DECIMAL(10,2),
ADD COLUMN     "seller_commission_rate" DECIMAL(7,4),
ADD COLUMN     "seller_platform_fee_max" DECIMAL(10,2),
ADD COLUMN     "seller_platform_fee_min" DECIMAL(10,2),
ADD COLUMN     "seller_platform_fee_rate" DECIMAL(7,4),
ADD COLUMN     "shipping_buyer_share" DECIMAL(5,2) NOT NULL DEFAULT 100,
ADD COLUMN     "taxpayer_type" "CommissionTaxpayerType" NOT NULL DEFAULT 'all';

-- CreateIndex
CREATE INDEX "commission_rules_category_id_taxpayer_type_seller_type_is_a_idx" ON "commission_rules"("category_id", "taxpayer_type", "seller_type", "is_active");


-- Back-fill v2 columns from legacy rates so existing rules keep the same behavior:
-- old buyerRate = buyer service fee (koruma bedeli), old sellerRate = seller commission.
UPDATE "commission_rules" SET
  "buyer_service_fee_rate" = "buyer_rate",
  "buyer_service_fee_min"  = "buyer_min",
  "buyer_service_fee_max"  = "buyer_max",
  "seller_commission_rate" = "seller_rate",
  "seller_commission_min"  = "seller_min",
  "seller_commission_max"  = "seller_max";

-- Back-fill historical order breakdown so reports stay coherent: the old
-- buyerFeeAmount was the buyer service fee, sellerFeeAmount the seller commission,
-- and shipping was fully buyer-paid.
UPDATE "orders" SET
  "buyer_service_fee_amount"  = "buyer_fee_amount",
  "seller_commission_amount"  = "seller_fee_amount",
  "buyer_shipping_amount"     = "shipping_cost";
