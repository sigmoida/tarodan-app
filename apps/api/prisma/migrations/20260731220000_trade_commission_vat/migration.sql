-- Takas aracılık komisyonu da bir hizmettir: KDV'si hizmeti alan taraftan
-- (nakit ödeyen) alınır ve ödediği toplama eklenir. `commission` artık KDV
-- HARİÇ matrahtır — siparişteki ücretlerle aynı semantik.
ALTER TABLE "trade_cash_payments"
  ADD COLUMN "commission_tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
