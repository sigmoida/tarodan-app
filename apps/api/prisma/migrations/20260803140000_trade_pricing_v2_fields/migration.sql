-- Takas fiyatlama v2 — alan hazırlığı.
--
-- Eski model: takas nakit farkının yüzdesi olarak alınan ARACILIK KOMİSYONU;
-- yalnız farkı ödeyen taraftan alınırdı. Kafa kafaya takasta platform hiçbir
-- gelir elde etmezken dört kargo bacağının maliyetini üstleniyordu.
--
-- Yeni model: HER İKİ taraf kendi ödemesini yapar →
--   takas hizmet bedeli + (2 × kargo) + (fark ödeyense fark)
--
-- Bu migration YALNIZ alanları ekler (additive; mevcut akış değişmez):
--   * commission_rules'a iki sabit takas ücreti (₺, KDV DAHİL — oran/KDV hesabı
--     yoktur; admin ne girerse o). Ürünü VEREN taraf seller, ALAN taraf buyer
--     ücretini öder.
--   * trades.pricing_version: takasın hangi modelle KABUL edildiği. Mevcut tüm
--     takaslar 'v1' kalır ve eski akışla biter; 'v2' yeni takaslara uygulanır.
--   * trade_cash_payments'a ücret/kargo kolonları ve recipient_id gevşetmesi
--     (hizmet bedeli + kargo platformda kalır, alıcısı yoktur).
--
-- SIRADAKİ (PR2): trade_cash_payments benzersizliği (trade_id) → (trade_id,
-- payer_id) çiftine taşınacak ve taraf başına satır oluşturulacak. Kardinalite
-- değişimi, iki satırı gerçekten yazan akışla birlikte gelir.

ALTER TABLE "commission_rules"
  ADD COLUMN "trade_fee_seller_amount" DECIMAL(10,2),
  ADD COLUMN "trade_fee_buyer_amount" DECIMAL(10,2);

ALTER TABLE "trades"
  ADD COLUMN "pricing_version" TEXT NOT NULL DEFAULT 'v1';

ALTER TABLE "trade_cash_payments"
  ADD COLUMN "trade_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "shipping_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- v2'de fark taşımayan ödeme satırlarında alıcı yoktur (ücret + kargo platformda
-- kalır); v1 satırları dolu kalmaya devam eder.
ALTER TABLE "trade_cash_payments"
  ALTER COLUMN "recipient_id" DROP NOT NULL;

-- v2'de komisyon alınmaz; kolon legacy olarak kalır ama yeni satırlar 0 yazar.
ALTER TABLE "trade_cash_payments"
  ALTER COLUMN "commission" SET DEFAULT 0;
