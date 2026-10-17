-- Yönetici (platform) iptalinin katalog nedeni. Taraflara bu kodun etiketi
-- söylenir; İptal & İade ekranı "Yönetici iptali" süzgeci bununla süzer.
-- Kodlar `@tarodan/types` ADMIN_CANCEL_REASON_CODES'tur ve uygulama tarafında
-- doğrulanır (enum değil metin: katalog göç gerektirmeden büyüyebilir).
-- Yöneticinin iç notu bu kolonda TUTULMAZ, yalnız denetim kaydındadır.
--
-- CANLI VERİ GÜVENLİĞİ: yalnız ekleme. Boş (NULL) kolon, varsayılan ve geri
-- doldurma YOK — NULL "yönetici katalog nedeniyle iptal etmedi" demektir;
-- eski yönetici iptalleri serbest metin gerekçeleriyle görünmeye devam eder.
ALTER TABLE "orders" ADD COLUMN "admin_cancel_reason_code" TEXT;
