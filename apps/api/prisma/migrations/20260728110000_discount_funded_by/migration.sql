-- Campaign cost ownership (F2.4): who absorbs a coupon discount.
-- Default 'seller' preserves existing behaviour (seller's payout base is reduced).
CREATE TYPE "DiscountFundedBy" AS ENUM ('seller', 'platform', 'shared');

ALTER TABLE "discounts"
  ADD COLUMN "funded_by" "DiscountFundedBy" NOT NULL DEFAULT 'seller',
  ADD COLUMN "platform_funded_ratio" DECIMAL(5, 4);

-- Per-order snapshot of the platform-funded portion of the coupon discount; added
-- back to the seller payout base in escrow so a platform-funded promo does not shrink
-- the seller's earnings. Default 0 = seller-funded (unchanged).
ALTER TABLE "orders"
  ADD COLUMN "platform_funded_discount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
