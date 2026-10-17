-- Süreler ve Kurallar → extend_once (teklif geçerliliği, takas yanıt ve ödeme
-- süresi): süre dolunca işlem iptal/expire edilmek yerine BİR kez uzatılabilir.
-- "Bir kez" bu kolonlarla kayda yazılır: dolu = hak kullanıldı.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Boş (NULL) kolonlar; geri doldurma YOK.
-- Eylem varsayılan kalıp (expire / cancel) seçilmedikçe hiçbir kayıt
-- uzatılmaz, yani davranış bu göçle değişmez.
ALTER TABLE "offers" ADD COLUMN "extended_at" TIMESTAMP(3);
ALTER TABLE "trades" ADD COLUMN "response_extended_at" TIMESTAMP(3);
ALTER TABLE "trades" ADD COLUMN "payment_extended_at" TIMESTAMP(3);
