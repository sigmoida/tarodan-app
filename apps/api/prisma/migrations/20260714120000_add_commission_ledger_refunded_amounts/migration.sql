-- #88: Kısmi iade komisyon pro-rate takibi. Additive (DEFAULT 0) — mevcut satırlar
-- 0 alır, hiçbir kod okumadan önce güvenli. Net komisyon = seller_commission -
-- refunded_seller_commission (buyer_fee için de aynı).
ALTER TABLE "commission_ledger" ADD COLUMN "refunded_seller_commission" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "commission_ledger" ADD COLUMN "refunded_buyer_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;
