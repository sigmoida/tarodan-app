-- NOT VALID bırakılmış CHECK kısıtlarını doğrula.
--
-- Bu kısıtlar NOT VALID eklendi ki geçmiş kirli veri varken deploy patlamasın;
-- yeni/güncellenen satırları o günden beri zorluyorlar. Doğrulanmadıkları sürece
-- MEVCUT satırlardaki ihlaller sessiz kalır ve kısıt "yarım" durur.
--
-- Üretim launch'ı boş/reset DB olduğu için VALIDATE orada bedavadır. Veri
-- taşıyan bir ortamda (staging) kirli satır varsa migration BURADA PATLAR —
-- bu istenen davranıştır (bkz. integrity_constraints_v2 madde C ile
-- payments_exactly_one_source_check için kurulan emsal): bozuk para satırı
-- sessizce yaşamak yerine deploy'u durdurup manuel inceleme ister.
--
-- VALIDATE, ekleme/güncellemeleri bloklamadan yalnız SHARE UPDATE EXCLUSIVE
-- kilidi alır; tablo boyutlarımızda maliyeti ihmal edilebilir.
ALTER TABLE "payout_transfers" VALIDATE CONSTRAINT "payout_transfers_net_amount_check";
ALTER TABLE "products" VALIDATE CONSTRAINT "products_quantity_nonneg_check";
ALTER TABLE "products" VALIDATE CONSTRAINT "products_reserved_quantity_nonneg_check";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_quantity_positive_check";
