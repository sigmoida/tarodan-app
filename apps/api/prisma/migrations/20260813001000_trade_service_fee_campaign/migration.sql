-- Takas hizmet bedeli kampanyası (İ25): admin tanımlar, kodsuz-otomatik,
-- kabul anında iki tarafın sabit ücretine iner. İndirim satıra yazılır ki
-- iade ve bütçe muhasebesi tahsil edilen gerçek tutarı izleyebilsin.
ALTER TYPE "DiscountTarget" ADD VALUE IF NOT EXISTS 'trade_service_fee';

ALTER TABLE "trade_cash_payments"
  ADD COLUMN "trade_fee_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "trade_fee_campaign_id" TEXT;
