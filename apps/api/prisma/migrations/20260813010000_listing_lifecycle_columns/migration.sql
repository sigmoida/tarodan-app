-- İlan yaşam döngüsü düzeltmeleri:
--  - published_at: yaşam süresi (60 gün) yayına giriş anından sayılır ve her
--    onayda tazelenir; süresi dolan ilan yeniden onaylanınca taze pencere alır
--    (eskiden createdAt'ten sayıldığı için yenileme imkânsızdı).
--  - rejection_reason: red gerekçesi kalıcı saklanır; satıcı ve admin detayı
--    tek seferlik bildirime mahkûm olmaz.
ALTER TABLE "products"
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "rejection_reason" TEXT;

-- Eski aktif kayıtlar için yayın anını createdAt kabul et (cron fallback'i de
-- var; backfill raporlamayı netleştirir).
UPDATE "products" SET "published_at" = "created_at" WHERE "status" = 'active';
