-- AlterTable: add shipping-tariff snapshot + buyer/seller split to the seller package.
-- No back-fill: existing packages keep shipping_cost and leave the snapshot null
-- (tariff_id null = historical order, never recomputed).
ALTER TABLE "order_packages"
  ADD COLUMN "shipping_tariff_id" TEXT,
  ADD COLUMN "shipping_tariff_version" INTEGER,
  ADD COLUMN "full_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "buyer_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "seller_shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
