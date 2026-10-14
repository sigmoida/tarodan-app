-- 2FA kapatma artık satırı siliyor (412e02115). Bu düzeltmeden ÖNCE kapatılmış,
-- eski (daha önce aktif) secret'ı taşıyan is_enabled = false satırlarını temizle;
-- aksi halde enable2FA 10 dk içinde bu eski secret'ı yeniden kullanabilir.
-- Hiç etkinleştirilmemiş bekleyen kurulumlar da silinir: kullanıcı kurulumu baştan başlatır.
-- Idempotent: tekrar çalıştırılırsa silinecek satır kalmaz.
DELETE FROM "two_factor_secrets" WHERE "is_enabled" = false;
