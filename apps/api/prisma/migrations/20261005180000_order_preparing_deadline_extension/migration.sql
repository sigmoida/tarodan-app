-- Satıcı hazırlık süresinin tek seferlik uzatması (Süreler ve Kurallar →
-- preparingDeadlineDays = extend_once). Uzatmada yeni son tarih mevcut
-- "preparing_deadline" kolonuna yazılır; bu iki kolon uzatmanın kaydıdır:
--   preparing_extended_at       — uzatma anı + "bir kez" claim damgası,
--   original_preparing_deadline — uzatmadan önceki son tarih (yalnız görüntü).
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Boş (NULL) kolonlar, varsayılan ve geri
-- doldurma YOK — NULL "hiç uzatılmadı" demektir, yani mevcut siparişlerin
-- davranışı bu göçle değişmez.
ALTER TABLE "orders" ADD COLUMN "preparing_extended_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "original_preparing_deadline" TIMESTAMP(3);
