-- Faz 5.5 AKTIVASYON: Platform Hizmet Bedeli (Alici %3) canliya alinir.
--
-- buyer-fee-rule kaydi Faz 2.2'de seed edilmis (is_active=false).
-- Bu migration is_active=true yaparak buyer fee'yi aktive eder.
--
-- Tetiklenen davranis:
-- - OrderService.calculateCommission BUYER eslemesi yapar (Faz 5.1 refactor)
-- - Order.buyerFeeAmount > 0 olur
-- - Web checkout sayfasinda 'Platform Hizmet Bedeli (%3)' satiri gorunur
--   (conditional render, > 0 oldugunda)
-- - CommissionLedger.buyerFee doldurulur
--
-- Geri alma: UPDATE ... SET is_active = false WHERE id = 'buyer-fee-rule';

UPDATE "commission_rules"
SET
  "is_active" = true,
  "updated_at" = NOW()
WHERE "id" = 'buyer-fee-rule';
