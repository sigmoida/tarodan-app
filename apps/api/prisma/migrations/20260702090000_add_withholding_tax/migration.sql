-- E-ticaret stopajı (GVK 94/19): kurumsal satıcı payout kesintisi + muhtasar raporu snapshot'ı
ALTER TABLE "orders" ADD COLUMN "withholding_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "payout_transfers" ADD COLUMN "withholding_tax" DECIMAL(10,2) NOT NULL DEFAULT 0;
