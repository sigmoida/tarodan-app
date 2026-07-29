-- Integrity constraints v2:
--  #1  payout net_amount: relax equality to <= (withholding + partial refund reduce net)
--  B   positivity CHECKs on quantity columns (drift/oversell guard at DB level)
--  C   validate the pre-existing payments exactly-one-source constraint

-- #1 (KRITIK): Eski constraint net_amount = amount - commission idi. Ancak kurumsal
-- (stopajli) saticida hold.amount = total - commission - withholding, ve kismi iade
-- sonrasi net daha da azalir. Esitlik constraint'i bu payout'lari REDDEDIYORDU (satici
-- hic odenmiyordu). Net; komisyon dusuldukten sonra stopaj + iade ile yalnizca AZALIR,
-- dolayisiyla dogru degismez net_amount <= amount - commission.
ALTER TABLE "payout_transfers" DROP CONSTRAINT IF EXISTS "payout_transfers_net_amount_check";
ALTER TABLE "payout_transfers" ADD CONSTRAINT "payout_transfers_net_amount_check"
  CHECK ("net_amount" <= "amount" - "commission") NOT VALID;

-- B: Miktar kolonlarinda DB seviyesinde pozitiflik. Negatiflik simdiye kadar yalnizca
-- uygulama kodundaki Math.max(0, ...) clamp'i ile engelleniyordu; drift/oversell'i DB
-- katmaninda da yakala. NOT VALID: mevcut satirlari dogrulamadan gecer, yeni/guncellenen
-- satirlarda enforce edilir.
ALTER TABLE "products" ADD CONSTRAINT "products_quantity_nonneg_check"
  CHECK ("quantity" IS NULL OR "quantity" >= 0) NOT VALID;
ALTER TABLE "products" ADD CONSTRAINT "products_reserved_quantity_nonneg_check"
  CHECK ("reserved_quantity" >= 0) NOT VALID;
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive_check"
  CHECK ("quantity" >= 1) NOT VALID;

-- C: payments_exactly_one_source_check NOT VALID eklenmisti; hicbir migration onu
-- dogrulamamisti. Mevcut satirlar temizse VALIDATE gecer (bozuk satir varsa migration
-- burada patlar -> manuel inceleme gerekir, ki bu istenen davranistir).
ALTER TABLE "payments" VALIDATE CONSTRAINT "payments_exactly_one_source_check";
