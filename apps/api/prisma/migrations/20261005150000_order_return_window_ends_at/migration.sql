-- Cayma (iade) penceresinin bitişi teslimde siparişe damgalanır
-- (Süreler ve Kurallar → returnWindowDays). İade uygunluğu, teslim →
-- tamamlandı geçişi ve escrow releaseAt aynı damgayı okur; admin pencereyi
-- sonradan değiştirse de bir siparişte iade hakkı ile satıcı ödemesi
-- çakışmaz.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Boş (NULL) bir kolon; geri doldurma
-- YOK — NULL olan (damgadan önce teslim edilmiş) siparişler bugünkü pencereyle
-- hesaplanmaya devam eder, yani davranış bu göçle değişmez.
ALTER TABLE "orders" ADD COLUMN "return_window_ends_at" TIMESTAMP(3);
