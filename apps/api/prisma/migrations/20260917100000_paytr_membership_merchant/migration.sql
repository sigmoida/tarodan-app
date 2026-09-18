-- Üyelik ödemeleri AYRI bir PayTR mağazasına taşınıyor.
--
-- PayTR, pazaryeri mağazasına non-3D (kullanıcısız recurring) yetkisi vermedi.
-- Üyelik ilk satın alması ve oto-yenilemesi bu yüzden non-3D yetkili yeni bir
-- mağazada alınır; sipariş, takas, öne çıkarma ve satıcı transferleri pazaryeri
-- mağazasında kalır.
--
-- Her PayTR kaydı artık çekildiği mağazayı taşır. İade, durum-sorgu, kart silme
-- ve rapor mutabakatı oid önekine değil bu kolona bakar: geçişten ÖNCE alınmış
-- üyelik ödemeleri eski mağazada kaldığı için iadeleri de oraya gitmelidir.
--
-- Backfill: mevcut her satır pazaryeri mağazasındadır (tek mağaza vardı). NOT
-- NULL DEFAULT PostgreSQL 11+ üzerinde yalnız katalog değişikliğidir — tablo
-- yeniden yazılmaz, ayrı bir veri script'i gerekmez.
CREATE TYPE "PaytrMerchant" AS ENUM ('marketplace', 'membership');

ALTER TABLE "payments"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';

ALTER TABLE "membership_payments"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';

-- Kart token'ları (utoken/ctoken) mağazaya özeldir. Kart TAŞINMAZ: üyeler kartını
-- yeni mağazada yeniden ekler (docs/OPERATIONS.md — PayTR üyelik mağazası geçişi).
ALTER TABLE "saved_cards"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';
CREATE INDEX "saved_cards_user_id_paytr_merchant_status_idx"
  ON "saved_cards"("user_id", "paytr_merchant", "status");

ALTER TABLE "payment_provider_events"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';

-- Rapor tabloları: her mağaza kendi dökümünü ve hakedişini verir. Aynı gün iki
-- mağazanın hakedişi eski (gün, para birimi, projeksiyon) anahtarında çakışırdı;
-- tekillik anahtarlarına mağaza eklenir.
ALTER TABLE "paytr_statement_lines"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';
DROP INDEX "paytr_statement_lines_merchant_oid_type_transaction_date_a_key";
CREATE UNIQUE INDEX "paytr_statement_lines_paytr_merchant_merchant_oid_type_tran_key"
  ON "paytr_statement_lines"("paytr_merchant", "merchant_oid", "type", "transaction_date", "amount");

ALTER TABLE "paytr_settlements"
  ADD COLUMN "paytr_merchant" "PaytrMerchant" NOT NULL DEFAULT 'marketplace';
DROP INDEX "paytr_settlements_date_paid_currency_is_projection_key";
CREATE UNIQUE INDEX "paytr_settlements_paytr_merchant_date_paid_currency_is_proj_key"
  ON "paytr_settlements"("paytr_merchant", "date_paid", "currency", "is_projection");
